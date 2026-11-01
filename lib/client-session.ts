import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import { useCustomExamStore } from '@/lib/custom-exam-store';

// Legacy per-browser chapter progress map (lib/chapter-progress.ts).
const LEGACY_CHAPTER_PROGRESS_KEY = 'medz_chapter_progress_v1';

/**
 * Wipe the quiz state the browser keeps between visits, in memory and in
 * localStorage, so the next person who signs in on a shared computer
 * cannot see the previous student's last result, answers or mistakes.
 * Call it on every sign-out path, before navigating away.
 */
export function clearLocalQuizState(): void {
  try {
    // Reset in-memory state first (this also rewrites the stored copy),
    // then delete the stored copy.
    useChapterQuizStore.setState(useChapterQuizStore.getInitialState(), true);
    useCustomExamStore.setState(useCustomExamStore.getInitialState(), true);
    useChapterQuizStore.persist.clearStorage();
    useCustomExamStore.persist.clearStorage();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LEGACY_CHAPTER_PROGRESS_KEY);
    }
  } catch {
    // localStorage can be unavailable (private mode, blocked site data);
    // signing out must never fail because of it.
  }
}
