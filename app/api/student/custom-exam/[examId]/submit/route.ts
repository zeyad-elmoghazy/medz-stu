import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { quizLimiter } from '@/lib/rate-limit';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';
import { mergeExamAnswers, orderByIds, scoreExam } from '@/lib/server/custom-exam';
import {
  NO_STORE,
  authenticateStudent,
  fetchPublishedQuestionsByIds,
  loadOwnedExam,
  serviceClient,
} from '@/lib/server/custom-exam-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/custom-exam/[examId]/submit
 *
 * Completes a custom exam. Counterpart of
 * POST /api/student/chapters/[chapterId]/submit and recorded the same
 * way — one completed `quiz_sessions` row, XP / daily cap / streak via
 * the SAME record_quiz_result RPC (migration 029), leaderboard cache
 * invalidated — except that the exam spans chapters:
 *
 *   - the session row has chapter_id NULL, subject_id 'custom-exam' and
 *     exam_id / exam_module_code / exam_chapter_ids set (migration 035).
 *     exam_id is UNIQUE, and the session is inserted BEFORE any XP is
 *     credited: a double submit (double click, retry, two tabs) fails
 *     on the unique index with 23505 and is rejected with 409 without
 *     touching XP or the streak. If the insert fails for any other
 *     reason nothing is credited and the saved exam is left in place so
 *     the student can retry — unlike the chapter route, an exam is never
 *     "completed" without being recorded.
 *   - each answer is later credited to the question's OWN chapter by the
 *     Focus Areas / mistakes helpers (lib/server/chapter-mistakes.ts).
 *
 * Scoring is recomputed here from the canonical answer key over the
 * exam's stored question set; nothing the client claims about
 * correctness is trusted. `answers` in the body is only a final
 * snapshot, merged into what is already saved. Skipped questions count
 * against accuracy, as in the chapter quiz.
 */

const ParamsSchema = z.object({ examId: z.string().uuid() });

const SubmitBodySchema = z.object({
  answers: z.record(z.string(), z.string().max(64)).optional(),
});

type ScoredQuestion = {
  id: number;
  question: string;
  correct_answer: string;
  topic: string;
  chapter_id: string;
  chapters:
    | { name: string; subjects: { name: string } | { name: string }[] | null }
    | { name: string; subjects: { name: string } | { name: string }[] | null }[]
    | null;
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ examId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid exam id' }, { status: 400 });
  }

  const auth = await authenticateStudent(request, quizLimiter);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = SubmitBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const service = serviceClient();
  const { exam, error: loadError } = await loadOwnedExam(
    service,
    auth.user.id,
    params.data.examId
  );
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500 });
  if (!exam) {
    return NextResponse.json(
      { error: 'Exam not found, or it was already submitted.' },
      { status: 404, headers: NO_STORE }
    );
  }

  const merged = mergeExamAnswers(
    exam.answers,
    parsed.data.answers ?? {},
    new Set(exam.question_ids)
  );
  if (Object.keys(merged).length === 0) {
    return NextResponse.json(
      { error: 'answers must contain at least one entry' },
      { status: 400 }
    );
  }

  const { rows, error: questionsError } = await fetchPublishedQuestionsByIds<ScoredQuestion>(
    service,
    exam.question_ids,
    'id, question, correct_answer, topic, chapter_id, chapters(name, subjects(name))'
  );
  if (questionsError) return NextResponse.json({ error: questionsError }, { status: 500 });
  // Questions unpublished since the draw are not scored.
  const questions = orderByIds(rows, exam.question_ids);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: 'None of this exam’s questions are available any more.' },
      { status: 400 }
    );
  }

  const { results, score, total, accuracy } = scoreExam(questions, merged);

  // Only answers to scored questions are stored on the session row.
  const scoredIds = new Set(questions.map((q) => String(q.id)));
  const sessionAnswers: Record<string, string> = {};
  for (const [key, choice] of Object.entries(merged)) {
    if (scoredIds.has(key)) sessionAnswers[key] = choice;
  }

  // 1) Record the attempt FIRST (exam_id is UNIQUE -> exactly once).
  const sessionInsert = await service.from('quiz_sessions').insert({
    student_id: auth.user.id,
    subject_id: 'custom-exam',
    chapter_id: null,
    answers: sessionAnswers,
    score,
    total_questions: total,
    accuracy,
    violations_count: 0,
    exam_id: exam.id,
    exam_module_code: exam.module_code,
    exam_chapter_ids: exam.chapter_ids,
  });
  if (sessionInsert.error) {
    if (sessionInsert.error.code === '23505') {
      // Already recorded (double submit). Make sure no stale in-flight row remains.
      await service
        .from('custom_exam_progress')
        .delete()
        .eq('id', exam.id)
        .eq('student_id', auth.user.id);
      return NextResponse.json(
        { error: 'This exam was already submitted.' },
        { status: 409, headers: NO_STORE }
      );
    }
    console.error('[custom-exam/submit] quiz_sessions insert failed:', sessionInsert.error.message);
    return NextResponse.json(
      { error: 'Could not record your exam. Please try again.' },
      { status: 500, headers: NO_STORE }
    );
  }

  // 2) Credit XP / daily cap / streak — the same RPC as the chapter quiz.
  const rpcRes = await service.rpc('record_quiz_result', {
    p_student_id: auth.user.id,
    p_correct_count: score,
    p_total_count: total,
    p_accuracy: accuracy,
    p_violations_count: 0,
    p_streak_date: todayISODate(),
  });
  if (rpcRes.error) {
    console.error('[custom-exam/submit] record_quiz_result failed:', rpcRes.error.message);
  }
  const xpEarned = rpcRes.data?.[0]?.xp_earned ?? 0;

  // 3) The attempt now lives in quiz_sessions: drop the unfinished row so
  //    Continue disappears and the dashboard doesn't count it twice.
  const cleanup = await service
    .from('custom_exam_progress')
    .delete()
    .eq('id', exam.id)
    .eq('student_id', auth.user.id);
  if (cleanup.error) {
    console.error('[custom-exam/submit] custom_exam_progress cleanup failed:', cleanup.error.message);
  }

  try {
    await invalidateCache(CACHE_KEYS.leaderboardGlobal());
  } catch {
    // non-fatal
  }

  return NextResponse.json(
    {
      score,
      total,
      accuracy,
      xpEarned,
      results,
      // What the results screen needs to describe each question.
      questions: questions.map((q) => {
        const chapter = Array.isArray(q.chapters) ? q.chapters[0] : q.chapters;
        const subject = chapter
          ? Array.isArray(chapter.subjects)
            ? chapter.subjects[0]
            : chapter.subjects
          : null;
        return {
          id: q.id,
          question: q.question,
          topic: q.topic,
          chapterId: q.chapter_id,
          chapterName: chapter?.name ?? '',
          subjectName: subject?.name ?? '',
        };
      }),
    },
    { headers: NO_STORE }
  );
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
