import { NextRequest, NextResponse } from 'next/server';
import { publicDbError } from '@/lib/api-error';
import { z } from 'zod';
import { progressLimiter } from '@/lib/rate-limit';
import { orderByIds } from '@/lib/server/custom-exam';
import { gatedReveals, revealsToJson } from '@/lib/server/reveal';
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
 * /api/student/custom-exam/[examId]
 *
 *   GET    -> the exam to take: its questions in the order they were
 *             drawn (each with its own chapter/subject, since an exam
 *             spans several), plus the answers and position saved so
 *             far. The server is the source of truth: the quiz page
 *             always starts from this, so Continue / reload / a second
 *             device show the same exam.
 *   DELETE -> discard the unfinished exam ("Discard" on the builder).
 *
 * Counterpart of /api/student/chapters/[chapterId]/questions +
 * /progress, merged: an exam's question set is fixed at creation, so
 * there is no separate "fresh start" handshake. Like the chapter route,
 * the questions carry NO answers: each is revealed after the student
 * answers it, by POST .../answer (migration 049); scoring is recomputed
 * server-side on submit.
 *
 * Ownership: every read/write is scoped to the caller's student id, so
 * another student's exam id behaves exactly like a missing one (404).
 */

const ParamsSchema = z.object({ examId: z.string().uuid() });

type QuestionRow = {
  id: number;
  question: string;
  choices: { id: string; text: string }[];
  topic: string;
  chapter_id: string;
  chapters:
    | { name: string; subjects: { name: string } | { name: string }[] | null }
    | { name: string; subjects: { name: string } | { name: string }[] | null }[]
    | null;
};

const QUESTION_COLUMNS = 'id, question, choices, topic, chapter_id, chapters(name, subjects(name))';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ examId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid exam id' }, { status: 400 });
  }

  const auth = await authenticateStudent(request, progressLimiter);
  if (auth.error) return auth.error;

  const service = serviceClient();
  const { exam, error } = await loadOwnedExam(service, auth.user.id, params.data.examId);
  if (error) return NextResponse.json({ error }, { status: 500, headers: NO_STORE });
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404, headers: NO_STORE });
  }

  const [questionsRes, moduleRes] = await Promise.all([
    fetchPublishedQuestionsByIds<QuestionRow>(service, exam.question_ids, QUESTION_COLUMNS),
    service.from('modules').select('name').eq('code', exam.module_code).maybeSingle(),
  ]);
  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error }, { status: 500, headers: NO_STORE });
  }

  // A question unpublished since the draw simply drops out of the exam.
  const ordered = orderByIds(questionsRes.rows, exam.question_ids);
  if (ordered.length === 0) {
    return NextResponse.json(
      { error: 'None of this exam’s questions are available any more.' },
      { status: 404, headers: NO_STORE }
    );
  }

  const questions = ordered.map((r) => {
    const chapter = Array.isArray(r.chapters) ? r.chapters[0] : r.chapters;
    const subject = chapter
      ? Array.isArray(chapter.subjects)
        ? chapter.subjects[0]
        : chapter.subjects
      : null;
    return {
      id: r.id,
      question: r.question,
      choices: r.choices,
      topic: r.topic,
      chapterId: r.chapter_id,
      chapterName: chapter?.name ?? '',
      subjectName: subject?.name ?? '',
    };
  });

  const liveIds = new Set(questions.map((q) => String(q.id)));
  const answers: Record<string, string> = {};
  for (const [key, choice] of Object.entries(exam.answers ?? {})) {
    if (liveIds.has(key)) answers[key] = choice;
  }

  // Feedback for the questions already answered (a resumed exam). Only
  // reveals recorded through the answer endpoint come back, never new ones.
  const { reveals, error: revealError } = await gatedReveals(
    service,
    auth.user.id,
    Object.keys(answers).map(Number)
  );
  if (revealError) {
    return NextResponse.json({ error: revealError }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      examId: exam.id,
      moduleCode: exam.module_code,
      moduleName: (moduleRes.data as { name: string } | null)?.name ?? exam.module_code,
      chapterIds: exam.chapter_ids,
      questionTotal: questions.length,
      questions,
      progress: {
        answers,
        currentQuestionIndex: Math.min(
          Math.max(0, exam.current_question_index),
          questions.length - 1
        ),
        reveals: revealsToJson(reveals),
      },
    },
    { headers: NO_STORE }
  );
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ examId: string }> }
) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid exam id' }, { status: 400 });
  }

  const auth = await authenticateStudent(request, progressLimiter);
  if (auth.error) return auth.error;

  const del = await serviceClient()
    .from('custom_exam_progress')
    .delete()
    .eq('id', params.data.examId)
    .eq('student_id', auth.user.id);
  if (del.error) {
    return NextResponse.json({ error: publicDbError(del.error) }, { status: 500 });
  }
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
