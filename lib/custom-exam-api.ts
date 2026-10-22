/**
 * Client for the Custom Exam surface — /api/student/custom-exam/**.
 *
 * The per-question calls (bookmark, notes, report, reference image) are
 * NOT re-implemented here: they are keyed by question id (or by the
 * question's own chapter id), so the exam page uses the ones in
 * lib/chapter-quiz-api.ts as they are.
 */

import type { ChapterQuizQuestion } from '@/lib/chapter-quiz-api';
import type { ExamSubjectOption } from '@/lib/custom-exam-rules';

/** A question in an exam: a chapter-quiz question that also says where it comes from. */
export type CustomExamQuestion = ChapterQuizQuestion & {
  chapterId: string;
  chapterName: string;
  subjectName: string;
};

export type CustomExam = {
  examId: string;
  moduleCode: string;
  moduleName: string;
  chapterIds: string[];
  questionTotal: number;
  /** In the order they were drawn. */
  questions: CustomExamQuestion[];
  progress: {
    /** questions.id (string key) -> chosen choice id. */
    answers: Record<string, string>;
    currentQuestionIndex: number;
  };
};

export type ActiveExam = {
  id: string;
  moduleCode: string;
  moduleName: string | null;
  chapterCount: number;
  answered: number;
  total: number;
  updatedAt: string;
};

export type ExamCatalogue = {
  moduleCode: string;
  moduleName: string;
  subjects: ExamSubjectOption[];
};

export type CustomExamResult = {
  score: number;
  total: number;
  accuracy: number;
  xpEarned: number;
  results: Array<{
    questionId: number;
    isCorrect: boolean;
    chosen: string | null;
    correct: string;
  }>;
  /** What the results screen needs to describe each question. */
  questions: Array<{
    id: number;
    question: string;
    topic: string;
    chapterId: string;
    chapterName: string;
    subjectName: string;
  }>;
};

/** An API failure that keeps the server's message (and `available`, when it sent one). */
export class CustomExamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly available?: number
  ) {
    super(message);
    this.name = 'CustomExamApiError';
  }
}

async function failure(res: Response): Promise<CustomExamApiError> {
  let msg = `HTTP ${res.status}`;
  let available: number | undefined;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
    if (typeof body?.available === 'number') available = body.available;
  } catch {
    /* ignore — keep the generic HTTP status message */
  }
  return new CustomExamApiError(msg, res.status, available);
}

const BASE = '/api/student/custom-exam';

/** Subjects + chapters of one module, with published-question counts. */
export async function fetchExamCatalogue(moduleCode: string): Promise<ExamCatalogue> {
  const res = await fetch(`${BASE}/catalogue?module=${encodeURIComponent(moduleCode)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** The student's unfinished exam (summary), or null. */
export async function fetchActiveExam(): Promise<ActiveExam | null> {
  const res = await fetch(BASE, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { exam: ActiveExam | null };
  return body.exam;
}

export type CreateExamInput =
  | { moduleCode: string; chapterIds: string[]; count: number }
  | { moduleCode: string; questionIds: number[] };

/**
 * Creates an exam (replacing any unfinished one) and returns its id.
 * Throws CustomExamApiError; for an oversized request `available` says how
 * many questions the selection really has.
 */
export async function createCustomExam(
  input: CreateExamInput
): Promise<{ examId: string; total: number }> {
  const res = await fetch(BASE, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** The exam to take: questions in drawn order, plus saved answers and position. */
export async function fetchCustomExam(examId: string): Promise<CustomExam> {
  const res = await fetch(`${BASE}/${encodeURIComponent(examId)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/**
 * Saves the exam so far (full snapshot — safe to repeat). Returns whether
 * the server confirmed the write: Save & Exit only leaves the page on
 * `true`. `keepalive` lets an in-flight save survive the tab closing.
 */
export async function saveCustomExamProgress(
  examId: string,
  snapshot: { answers: Record<string, string>; currentQuestionIndex: number }
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(examId)}/progress`, {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Completes the exam: scored server-side, recorded, XP credited. */
export async function submitCustomExam(
  examId: string,
  answers: Record<string, string>
): Promise<CustomExamResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(examId)}/submit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** Discards the unfinished exam. Returns whether it succeeded. */
export async function discardCustomExam(examId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(examId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
