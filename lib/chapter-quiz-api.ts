/**
 * Fetchers for the chapter-scoped quiz surface —
 * /api/student/chapters/[chapterId]/questions and friends. Parallel to
 * lib/catalogue-api.ts's pattern. The question-level helpers here
 * (bookmark, notes, report, reference image) are also used by the
 * Custom Exam quiz; lib/custom-exam-api.ts holds the exam-specific calls.
 */

import type { FlagReason } from '@/lib/question-flags';
import { readApiError } from '@/lib/catalogue-api';

export type ChapterQuizChoice = {
  id: string;
  text: string;
};

/** A question as served: no answer. The answer arrives per question, after it is answered. */
export type ChapterQuizQuestion = {
  id: number;
  question: string;
  choices: ChapterQuizChoice[];
  topic: string;
};

/** What the server reveals about a question once the student has answered it. */
export type ChapterAnswerReveal = {
  correctAnswer: string;
  explanation: string;
  choiceRationales?: Record<string, string>;
  reference: string;
  referencePage: number | null;
};

/** A question together with its reveal: what the post-answer screen renders. */
export type RevealedQuestion = ChapterQuizQuestion & ChapterAnswerReveal;

export type ChapterQuiz = {
  chapterId: string;
  chapterName: string;
  moduleCode: string;
  subjectName: string;
  /** Subject page this chapter belongs to (module page or catalogue as fallbacks). */
  subjectHref: string;
  questionTotal: number;
  questions: ChapterQuizQuestion[];
};

export async function fetchChapterQuiz(chapterId: string): Promise<ChapterQuiz> {
  const res = await fetch(
    `/api/student/chapters/${encodeURIComponent(chapterId)}/questions`,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!res.ok) throw new Error(await readApiError(res));
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
    /** null unless the server already revealed this question's answer to the student. */
    correct: string | null;
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
  if (!res.ok) throw new Error(await readApiError(res));
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
  /** Reveals for the answered questions the server has already shown (keyed by question id). */
  reveals?: Record<string, ChapterAnswerReveal>;
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
  },
  /** Called with the XP the server credited for this save, when above 0. */
  onXp?: (xp: number) => void
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
    if (res.ok && onXp) {
      const body = (await res.json().catch(() => null)) as { xpAwarded?: number } | null;
      if (body?.xpAwarded && body.xpAwarded > 0) onXp(body.xpAwarded);
    }
    return res.ok;
  } catch {
    return false;
  }
}

export type ChapterAnswerResult = ChapterAnswerReveal & {
  isCorrect: boolean;
  /** The answer on record (the first one given, if the question was answered before). */
  chosen: string;
  /** XP credited for this answer. */
  xpAwarded: number;
  answered: number;
  total: number;
};

/**
 * Answers one question: the server stores the answer, credits XP and
 * returns the verdict with the explanation —
 * /api/student/chapters/[chapterId]/answer. This is the only way the quiz
 * learns whether an answer was right. Idempotent: re-sending an answered
 * question returns the stored verdict. Throws with a readable message.
 */
export async function submitChapterAnswer(
  chapterId: string,
  input: {
    questionId: number;
    choice: string;
    currentQuestionIndex: number;
    questionIds?: number[];
  }
): Promise<ChapterAnswerResult> {
  const res = await fetch(`/api/student/chapters/${encodeURIComponent(chapterId)}/answer`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

/** The reveal part of an answer result. */
export function toReveal(r: ChapterAnswerResult): ChapterAnswerReveal {
  return {
    correctAnswer: r.correctAnswer,
    explanation: r.explanation,
    choiceRationales: r.choiceRationales,
    reference: r.reference,
    referencePage: r.referencePage,
  };
}

/**
 * Explanations for questions this student has already answered —
 * /api/student/reveals (200 ids per request). Questions the server has not
 * revealed to this student are absent from the result.
 */
export async function fetchReveals(
  questionIds: number[]
): Promise<Record<string, ChapterAnswerReveal>> {
  const out: Record<string, ChapterAnswerReveal> = {};
  for (let i = 0; i < questionIds.length; i += 200) {
    const res = await fetch('/api/student/reveals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIds: questionIds.slice(i, i + 200) }),
    });
    if (!res.ok) throw new Error(await readApiError(res));
    const body = (await res.json()) as { reveals: Record<string, ChapterAnswerReveal> };
    Object.assign(out, body.reveals);
  }
  return out;
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
