/**
 * Fetcher for the chapter-scoped quiz surface —
 * /api/student/chapters/[chapterId]/questions. Parallel to
 * lib/catalogue-api.ts's pattern; not related to the static
 * Histology quiz's data path.
 */

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
