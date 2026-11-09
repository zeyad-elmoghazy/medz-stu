import type { SupabaseClient } from '@supabase/supabase-js';
import { untypedFrom } from '@/lib/supabase-server';
import { currentAcademicYear } from '@/lib/academic-year';
import { chapterBackHref } from '@/lib/catalogue';
import { embedded } from '@/lib/postgrest';

/*
 * What should a student do next? One answer, shown as the top card on Home.
 *
 * The types below are a CONTRACT with the bueno (mascot) session, which reads
 * NextStep: change them only together.
 */
export type NextStepKind = 'resume' | 'next-chapter' | 'module' | 'year';

export interface NextStep {
  kind: NextStepKind;
  href: string;
  label: string;
  chapterId?: string;
}

export interface NextStepInput {
  /** Unfinished chapter attempts (chapter_quiz_progress with answers). */
  unfinished: { chapterId: string; chapterName: string; updatedAt: string }[];
  /** The chapter the student last finished, and the chapter after it, if any. */
  lastPlayed: {
    chapterId: string;
    subjectHref: string;
    nextChapterId?: string;
    nextChapterName?: string;
  } | null;
  /** The student's CURRENT year (1-5), or null if they never chose one. */
  academicYear: number | null;
  /** First module of their year that has published questions, if any. */
  currentModule: { code: string; href: string; name: string } | null;
}

/**
 * Chooses the next step from what we know about the student. Pure: no I/O.
 *
 * Order, first match wins:
 *   1. 'resume'        an unfinished chapter: the most recently touched one.
 *   2. 'next-chapter'  the chapter after the one they last finished.
 *   3. 'module'        the first stocked module of their year.
 *   4. 'year'          their year's catalogue page, else the catalogue root.
 *
 * Decisions (change them here, and in the spec, together):
 *   - Unfinished beats next chapter: half a chapter is the cheapest thing to
 *     finish, and saved answers are lost if it is abandoned.
 *   - No staleness cutoff on an unfinished attempt: the card is a suggestion,
 *     and "Start over" lives on the subject page. ponytail: add a cutoff only
 *     if students report being pulled back to something old.
 *   - Finished the last chapter of a subject: fall through to their module
 *     rather than the subject page, which they have just seen.
 *
 * __tests__/unit/next-step.test.ts is the spec.
 */
export function pickNextStep(input: NextStepInput): NextStep {
  const { unfinished, lastPlayed, academicYear, currentModule } = input;

  const latest = unfinished.reduce<NextStepInput['unfinished'][number] | null>(
    // Compare as dates: the strings are not guaranteed to share a format.
    (best, a) => (!best || Date.parse(a.updatedAt) > Date.parse(best.updatedAt) ? a : best),
    null
  );
  if (latest) {
    return {
      kind: 'resume',
      href: `/student/quiz/chapter/${encodeURIComponent(latest.chapterId)}`,
      label: `Continue ${latest.chapterName}`,
      chapterId: latest.chapterId,
    };
  }

  if (lastPlayed?.nextChapterId) {
    return {
      kind: 'next-chapter',
      href: `/student/quiz/chapter/${encodeURIComponent(lastPlayed.nextChapterId)}`,
      label: `Next up: ${lastPlayed.nextChapterName ?? 'next chapter'}`,
      chapterId: lastPlayed.nextChapterId,
    };
  }

  if (currentModule) {
    return { kind: 'module', href: currentModule.href, label: `Start here: ${currentModule.name}` };
  }

  return academicYear
    ? { kind: 'year', href: `/student/catalogue/${academicYear}`, label: `Browse Year ${academicYear}` }
    : { kind: 'year', href: '/student/catalogue', label: 'Browse the catalogue' };
}

/** Gathers the input from the database and picks. `db` is the student's own client. */
export async function getNextStep(db: SupabaseClient, studentId: string): Promise<NextStep> {
  return pickNextStep(await loadNextStepInput(db, studentId));
}

type ChapterRow = {
  id: string;
  name: string;
  ordinal: number;
  module_code: string;
  subject_id: string;
  subjects: { slug: string } | { slug: string }[] | null;
  modules: { year_num: string } | { year_num: string }[] | null;
};

/** Exported so the integration test can check what we gather, apart from how we pick. */
export async function loadNextStepInput(
  db: SupabaseClient,
  studentId: string
): Promise<NextStepInput> {
  const client = untypedFrom(db);

  const [progressRes, sessionRes, profileRes] = await Promise.all([
    client
      .from('chapter_quiz_progress')
      .select('chapter_id, answers, updated_at')
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false })
      .limit(5),
    client
      .from('quiz_sessions')
      .select('chapter_id')
      .eq('student_id', studentId)
      .not('chapter_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1),
    client
      .from('profiles')
      .select('academic_year, academic_year_session')
      .eq('id', studentId)
      .single(),
  ]);

  // Unfinished attempts. A saved row with no answers is just an opened quiz.
  const progressRows = ((progressRes.data ?? []) as {
    chapter_id: string;
    answers: Record<string, string> | null;
    updated_at: string;
  }[]).filter((r) => Object.keys(r.answers ?? {}).length > 0);

  const lastSession = ((sessionRes.data ?? []) as { chapter_id: string }[])[0];

  const wantedIds = [...new Set([...progressRows.map((r) => r.chapter_id), lastSession?.chapter_id])].filter(
    (id): id is string => Boolean(id)
  );
  const chaptersById = new Map<string, ChapterRow>();
  if (wantedIds.length > 0) {
    const res = await client
      .from('chapters')
      .select('id, name, ordinal, module_code, subject_id, subjects(slug), modules(year_num)')
      .in('id', wantedIds);
    for (const c of (res.data ?? []) as ChapterRow[]) chaptersById.set(c.id, c);
  }

  const unfinished = progressRows.flatMap((r) => {
    const chapter = chaptersById.get(r.chapter_id);
    return chapter ? [{ chapterId: r.chapter_id, chapterName: chapter.name, updatedAt: r.updated_at }] : [];
  });

  // The last chapter they finished, and the next one in the same subject that
  // has questions. ponytail: "next" is by ordinal and ignores whether it was
  // already attempted; track that only if students report being sent back.
  let lastPlayed: NextStepInput['lastPlayed'] = null;
  const lastChapter = lastSession ? chaptersById.get(lastSession.chapter_id) : undefined;
  if (lastChapter) {
    const nextRes = await client
      .from('chapters')
      .select('id, name')
      .eq('module_code', lastChapter.module_code)
      .eq('subject_id', lastChapter.subject_id)
      .gt('ordinal', lastChapter.ordinal)
      .gt('published_count', 0)
      .order('ordinal', { ascending: true })
      .limit(1);
    const next = ((nextRes.data ?? []) as { id: string; name: string }[])[0];
    lastPlayed = {
      chapterId: lastChapter.id,
      subjectHref: chapterBackHref({
        yearNum: embedded(lastChapter.modules)?.year_num,
        moduleCode: lastChapter.module_code,
        subjectSlug: embedded(lastChapter.subjects)?.slug,
      }),
      ...(next ? { nextChapterId: next.id, nextChapterName: next.name } : {}),
    };
  }

  // Their year, and the first module in it that has questions to practise.
  const profile = profileRes.data as { academic_year: number | null; academic_year_session: number | null } | null;
  const year = currentAcademicYear(profile?.academic_year, profile?.academic_year_session);

  let currentModule: NextStepInput['currentModule'] = null;
  let academicYear: number | null = null;
  if (year !== null) {
    const modulesRes = await client
      .from('modules')
      .select('code, name')
      .eq('year_num', String(year))
      .eq('is_active', true)
      .order('code', { ascending: true });
    const modules = (modulesRes.data ?? []) as { code: string; name: string }[];
    // The catalogue only has the years that have modules (1-3 today).
    if (modules.length > 0) {
      academicYear = year;
      const stockedRes = await client
        .from('chapters')
        .select('module_code')
        .in('module_code', modules.map((m) => m.code))
        .gt('published_count', 0);
      const stocked = new Set(((stockedRes.data ?? []) as { module_code: string }[]).map((c) => c.module_code));
      const first = modules.find((m) => stocked.has(m.code));
      if (first) {
        currentModule = {
          code: first.code,
          name: first.name,
          href: `/student/catalogue/${year}/${encodeURIComponent(first.code)}`,
        };
      }
    }
  }

  return { unfinished, lastPlayed, academicYear, currentModule };
}
