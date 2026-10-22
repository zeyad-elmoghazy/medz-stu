/**
 * Fetchers for the chapter-scoped quiz surface —
 * /api/student/chapters/[chapterId]/questions and friends. Parallel to
 * lib/catalogue-api.ts's pattern. The question-level helpers here
 * (bookmark, notes, report, reference image) are also used by the
 * Custom Exam quiz; lib/custom-exam-api.ts holds the exam-specific calls.
 */

import type { FlagReason } from '@/lib/question-flags';

export type ChapterQuizChoice = {
  id: string;
  text: string;
};

export type ChapterQuizQuestion = {
  id: number;
  question: string;
  choices: ChapterQuizChoice[];
  correctAnswer: string;
  explanation: string;
  choiceRationales?: Record<string, string>;
  reference: string;
  topic: string;
  referencePage: number | null;
};

export type ChapterQuiz = {
  chapterId: string;
  chapterName: string;
  moduleCode: string;
  subjectName: string;
  questionTotal: number;
  questions: ChapterQuizQuestion[];
};

export async function fetchChapterQuiz(chapterId: string): Promise<ChapterQuiz> {
  const res = await fetch(
    `/api/student/chapters/${encodeURIComponent(chapterId)}/questions`,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore — keep the generic HTTP status message */
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Resolves one question's book-page reference into a signed image
 * URL, on demand — called after the student answers, not eagerly
 * for the whole chapter. Returns null for any "no image" case
 * (unlinked module, missing page) rather than throwing — the quiz
 * shouldn't break over a missing reference image.
 */
export async function fetchChapterReferenceImage(
  chapterId: string,
  page: number
): Promise<string | null> {
  const res = await fetch(
    `/api/student/chapters/${encodeURIComponent(chapterId)}/reference-image?page=${page}`,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { url: string | null };
  return body.url ?? null;
}

/** Whether the signed-in student has bookmarked this question. */
export async function fetchBookmarkStatus(questionId: number): Promise<boolean> {
  const res = await fetch(`/api/student/bookmarks?questionId=${questionId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { bookmarked: boolean };
  return body.bookmarked;
}

/**
 * Creates a bookmark row for this question. Returns whether the
 * write actually succeeded — callers should only flip their UI
 * state on `true`, not optimistically before this resolves, since
 * the whole point of this endpoint is that the toggle reflects a
 * real row, not just local state.
 */
export async function addBookmark(questionId: number): Promise<boolean> {
  const res = await fetch('/api/student/bookmarks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
  });
  return res.ok;
}

/** Removes the bookmark row for this question. Same success contract as addBookmark. */
export async function removeBookmark(questionId: number): Promise<boolean> {
  const res = await fetch(`/api/student/bookmarks?questionId=${questionId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.ok;
}

/** Whether the signed-in student has already reported this question. */
export async function fetchFlagStatus(questionId: number): Promise<boolean> {
  const res = await fetch(`/api/student/questions/${questionId}/flag`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { flagged: boolean };
  return body.flagged;
}

/**
 * Reports a question to the admins. Resolves 'sent' for a new report and
 * 'already_reported' when this student reported it before (409) — both
 * mean "the admins have it", so callers show the same "Reported" state.
 * Anything else throws with the server's message so the modal can show
 * it inline instead of silently dropping the report.
 */
export async function reportQuestion(
  questionId: number,
  input: { reason: FlagReason; detail?: string }
): Promise<'sent' | 'already_reported'> {
  const res = await fetch(`/api/student/questions/${questionId}/flag`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.ok) return 'sent';
  let msg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (res.status === 409 && body?.error === 'already_reported') return 'already_reported';
    if (res.status === 429) msg = 'Too many reports — please try again later.';
    else if (body?.error) msg = body.error;
  } catch {
    /* ignore — keep the generic HTTP status message */
  }
  throw new Error(msg);
}

export type ChapterQuizResult = {
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
};

/**
 * Records the completed practice quiz, earns XP toward the
 * leaderboard, and returns the per-question breakdown the results
 * screen renders from — /api/student/chapters/[chapterId]/submit.
 * Recomputes score server-side from the canonical answer key;
 * `answers` here is just the student's picks, keyed by question id.
 * `questionIds`, when passed (e.g. a "Practice mistakes" subset),
 * restricts scoring to just those questions.
 */
export async function submitChapterQuiz(
  chapterId: string,
  answers: Record<string, string>,
  questionIds?: number[]
): Promise<ChapterQuizResult> {
  const res = await fetch(
    `/api/student/chapters/${encodeURIComponent(chapterId)}/submit`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, questionIds }),
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore — keep the generic HTTP status message */
    }
    throw new Error(msg);
  }
  return res.json();
}

export type ChapterProgress = {
  /** questions.id (string key) -> chosen choice id. */
  answers: Record<string, string>;
  currentQuestionIndex: number;
  /** Set for a "Practice mistakes" subset run; null = whole chapter. */
  questionIds: number[] | null;
  totalQuestions: number;
  updatedAt: string;
};

/**
 * The student's saved, unfinished attempt at this chapter, or null
 * if there is none — /api/student/chapters/[chapterId]/progress.
 * Throws on a failed request (rather than returning null) so the
 * quiz page never mistakes "couldn't reach the server" for "nothing
 * saved" and silently starts the chapter over.
 */
export async function fetchChapterProgress(
  chapterId: string
): Promise<ChapterProgress | null> {
  const res = await fetch(
    `/api/student/chapters/${encodeURIComponent(chapterId)}/progress`,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { progress: ChapterProgress | null };
  return body.progress;
}

/**
 * Saves the attempt so far (full snapshot — safe to repeat). Returns
 * whether the server confirmed the write: Save & Exit only leaves the
 * page on `true`. `keepalive` lets an in-flight save survive the tab
 * being closed.
 */
export async function saveChapterProgress(
  chapterId: string,
  snapshot: {
    answers: Record<string, string>;
    currentQuestionIndex: number;
    questionIds?: number[];
  }
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/student/chapters/${encodeURIComponent(chapterId)}/progress`,
      {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Discards the saved attempt ("Start over"). Returns whether it succeeded. */
export async function deleteChapterProgress(chapterId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/student/chapters/${encodeURIComponent(chapterId)}/progress`,
      { method: 'DELETE', credentials: 'include' }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** The signed-in student's saved note content for this question, or '' if none. */
export async function fetchNote(questionId: number): Promise<string> {
  const res = await fetch(`/api/student/notes?questionId=${questionId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return '';
  const body = (await res.json()) as { content: string };
  return body.content;
}

/**
 * Saves note content for this question. Returns whether the write
 * actually succeeded — the "Saved" indicator in NotesEditor is
 * gated on this, not shown optimistically before the request
 * resolves.
 */
export async function saveNote(questionId: number, content: string): Promise<boolean> {
  const res = await fetch('/api/student/notes', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, content }),
  });
  return res.ok;
}
