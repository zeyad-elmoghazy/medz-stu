/**
 * Fetchers for the student-facing /api/student/catalogue/* surface.
 */

import type { NextStep } from '@/lib/student/next-step';
import type { ExamPlan } from '@/lib/student/exam-plan';

export type CatalogueModule = {
  code: string;
  name: string;
  chapterCount: number;
  publishedCount: number;
  subjectCount: number;
  subjectNames: string[];
};

export type CatalogueYear = {
  year: number;
  label: string;
  moduleCount: number;
  subjectCount: number;
  chapterCount: number;
  modules: CatalogueModule[];
};

export type ModulesByYear = {
  years: CatalogueYear[];
  totals: { modules: number; subjects: number; chapters: number };
};

export type CatalogueSubject = {
  slug: string;
  name: string;
  chapterCount: number;
  publishedCount: number;
};

export type SubjectsByModule = {
  moduleCode: string;
  moduleName: string;
  chapterTotal: number;
  publishedTotal: number;
  subjects: CatalogueSubject[];
};

export type CatalogueChapter = {
  id: string;
  slug: string;
  name: string;
  ordinal: number;
  publishedCount: number;
  topic: string | null;
  // Real, DB-backed (quiz_sessions.chapter_id) — not the client-only
  // useChapterQuizStore, which can't tell a perfect-score attempt
  // from never having attempted the chapter at all.
  attempted: boolean;
  mistakeQuestionIds: number[];
  // An unfinished attempt the student can resume (chapter_quiz_progress,
  // migration 032), or null. Drives the "Continue" button.
  inProgress: { answered: number; total: number } | null;
};

export type ChaptersBySubject = {
  moduleCode: string;
  moduleName: string;
  subjectSlug: string;
  subjectName: string;
  chapterTotal: number;
  publishedTotal: number;
  chapters: CatalogueChapter[];
};

export async function fetchNextStep(): Promise<NextStep> {
  const res = await fetch('/api/student/next-step', { credentials: 'include', cache: 'no-store' });
  const body = await json<{ nextStep: NextStep }>(res);
  return body.nextStep;
}

/** The Home exam countdown; null until exam dates are filled in lib/exam-schedule.ts. */
export async function fetchExamPlan(): Promise<ExamPlan | null> {
  const res = await fetch('/api/student/exam-plan', { credentials: 'include', cache: 'no-store' });
  const body = await json<{ examPlan: ExamPlan | null }>(res);
  return body.examPlan;
}

/**
 * A message safe to show a student for a failed API call, instead of
 * "HTTP 500". Our own 4xx messages ("Chapter not found") are written for
 * people and pass through; auth, throttling and server faults get plain
 * wording, since the body of a 5xx is never meant for them.
 */
export async function readApiError(res: Response): Promise<string> {
  if (res.status === 401) return 'Your session has expired. Please log in again.';
  if (res.status === 429) return 'Too many requests. Wait a moment and try again.';
  if (res.status < 500) {
    try {
      const body = await res.json();
      if (typeof body?.error === 'string' && body.error) return body.error;
    } catch {
      /* no usable body: fall through */
    }
    return "We couldn't complete that request. Please try again.";
  }
  return 'Something went wrong on our side. Please try again in a moment.';
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function fetchModulesByYear(): Promise<ModulesByYear> {
  // No `cache: 'no-store'`: the route sends `private, max-age=60`, so the
  // browser can reuse it while students move between catalogue screens.
  const res = await fetch('/api/student/catalogue/modules-by-year', {
    credentials: 'include',
  });
  return json(res);
}

export async function fetchSubjectsByModule(code: string): Promise<SubjectsByModule> {
  const res = await fetch(
    `/api/student/catalogue/subjects-by-module?code=${encodeURIComponent(code)}`,
    { credentials: 'include' }
  );
  return json(res);
}

export async function fetchChaptersBySubject(
  moduleCode: string,
  subjectSlug: string
): Promise<ChaptersBySubject> {
  const url = new URL('/api/student/catalogue/chapters-by-subject', window.location.origin);
  url.searchParams.set('moduleCode', moduleCode);
  url.searchParams.set('subjectSlug', subjectSlug);
  const res = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
  return json(res);
}
