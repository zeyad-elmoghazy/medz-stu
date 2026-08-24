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
