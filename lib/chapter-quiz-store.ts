import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Chapter-scoped counterpart to lib/store.ts's useQuizStore — same
 * shape and actions, adapted for a `chapterId`-keyed session instead
 * of a `subjectId`-keyed one, and for mistake tracking namespaced
 * per chapter (unlike the reference store's single flat array, which
 * only ever has to disambiguate within one subject's question ids —
 * chapter question ids can collide across different chapters).
 * A new, parallel file: lib/store.ts is left untouched.
 *
 * Unlike the reference store, bookmarks and notes are NOT tracked
 * here — the chapter quiz page keeps using its already-working,
 * DB-backed bookmark/notes API (lib/chapter-quiz-api.ts) instead of
 * the reference implementation's purely local, unpersisted toggle.
 */

export type ChapterSubmissionResult = {
  sessionId: string;
  score: number;
  total: number;
  accuracy: number;
  results: Array<{
    questionId: number;
    isCorrect: boolean;
    chosen: string | null;
    correct: string;
  }>;
};

export type ChapterSavedSession = {
  chapterId: string;
  currentQuestionIndex: number;
  answers: Record<number, string>;
  startedAt: string;
};

const SAVED_SESSION_KEY = 'medz_chapter_quiz_session';
const SAVED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ChapterQuizState = {
  currentQuestionIndex: number;
  answers: Record<number, string>;
  sessionComplete: boolean;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  filterQuestionIds: number[] | null;
  lastResult: ChapterSubmissionResult | null;
  savedSession: ChapterSavedSession | null;
  /** Question ids the student got wrong, namespaced per chapter so
   *  "Practice mistakes" never mixes ids from two different chapters. */
  mistakeQuestionIdsByChapter: Record<string, number[]>;

  answerQuestion: (questionId: number, choiceId: string) => void;
  nextQuestion: (totalQuestions: number) => void;
  jumpToQuestion: (index: number) => void;
  completeSession: () => void;
  startSession: () => void;
  startMistakeSession: (chapterId: string, mistakeIds: number[]) => void;
  clearFilter: () => void;
  setLastResult: (result: ChapterSubmissionResult) => void;
  recordMistakes: (chapterId: string, ids: number[]) => void;
  clearMistakes: (chapterId: string, ids: number[]) => void;
  saveSession: (chapterId: string) => void;
  loadSession: (chapterId: string) => boolean;
  clearSession: () => void;
};

const initialState = {
  currentQuestionIndex: 0,
  answers: {} as Record<number, string>,
  sessionComplete: false,
  sessionStartedAt: null as number | null,
  sessionEndedAt: null as number | null,
  filterQuestionIds: null as number[] | null,
  lastResult: null as ChapterSubmissionResult | null,
  savedSession: null as ChapterSavedSession | null,
  mistakeQuestionIdsByChapter: {} as Record<string, number[]>,
};

export const useChapterQuizStore = create<ChapterQuizState>()(
  persist(
    (set, get) => ({
      ...initialState,

      answerQuestion: (questionId, choiceId) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: choiceId },
        })),

      nextQuestion: (totalQuestions) => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex >= totalQuestions - 1) {
          set({ sessionComplete: true, sessionEndedAt: Date.now() });
          return;
        }
        set({ currentQuestionIndex: currentQuestionIndex + 1 });
      },

      jumpToQuestion: (index) =>
        set({ currentQuestionIndex: Math.max(0, index), sessionComplete: false }),

      completeSession: () =>
        set({ sessionComplete: true, sessionEndedAt: Date.now() }),

      startSession: () =>
        set({
          sessionStartedAt: Date.now(),
          sessionEndedAt: null,
          filterQuestionIds: null,
          answers: {},
          currentQuestionIndex: 0,
          sessionComplete: false,
        }),

      startMistakeSession: (chapterId, mistakeIds) =>
        set((state) => {
          const newAnswers = { ...state.answers };
          mistakeIds.forEach((id) => {
            delete newAnswers[id];
          });
          return {
            answers: newAnswers,
            sessionStartedAt: Date.now(),
            sessionEndedAt: null,
            filterQuestionIds: mistakeIds,
            currentQuestionIndex: 0,
            sessionComplete: false,
          };
        }),

      clearFilter: () => set({ filterQuestionIds: null }),

      setLastResult: (result) => set({ lastResult: result }),

      recordMistakes: (chapterId, ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const existing = state.mistakeQuestionIdsByChapter[chapterId] ?? [];
          const merged = new Set(existing);
          for (const id of ids) merged.add(id);
          return {
            mistakeQuestionIdsByChapter: {
              ...state.mistakeQuestionIdsByChapter,
              [chapterId]: Array.from(merged),
            },
          };
        }),

      clearMistakes: (chapterId, ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const existing = state.mistakeQuestionIdsByChapter[chapterId];
          if (!existing || existing.length === 0) return {};
          const remove = new Set(ids);
          return {
            mistakeQuestionIdsByChapter: {
              ...state.mistakeQuestionIdsByChapter,
              [chapterId]: existing.filter((id) => !remove.has(id)),
            },
          };
        }),

      /**
       * Snapshot the current quiz state to the store AND
       * localStorage. Same purpose as the reference store's
       * saveSession — called from the Exit Confirmation Modal.
       */
      saveSession: (chapterId) => {
        const state = get();
        const session: ChapterSavedSession = {
          chapterId,
          currentQuestionIndex: state.currentQuestionIndex,
          answers: state.answers,
          startedAt: state.sessionStartedAt
            ? new Date(state.sessionStartedAt).toISOString()
            : new Date().toISOString(),
        };
        set({ savedSession: session });
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              SAVED_SESSION_KEY,
              JSON.stringify(session)
            );
          } catch {
            // localStorage can be unavailable in private mode — the
            // in-memory copy in `savedSession` still works for this tab.
          }
        }
      },

      /**
       * Try to restore a saved session for `chapterId`. Same safety
       * checks as the reference store: chapterId must match, and
       * startedAt must be within the last 24 hours.
       */
      loadSession: (chapterId) => {
        if (typeof window === 'undefined') return false;
        let raw: string | null = null;
        try {
          raw = window.localStorage.getItem(SAVED_SESSION_KEY);
        } catch {
          return false;
        }
        if (!raw) return false;

        let parsed: ChapterSavedSession;
        try {
          parsed = JSON.parse(raw) as ChapterSavedSession;
        } catch {
          window.localStorage.removeItem(SAVED_SESSION_KEY);
          return false;
        }

        if (parsed.chapterId !== chapterId) return false;

        const startedAtMs = new Date(parsed.startedAt).getTime();
        if (!Number.isFinite(startedAtMs)) {
          window.localStorage.removeItem(SAVED_SESSION_KEY);
          return false;
        }
        if (Date.now() - startedAtMs > SAVED_SESSION_MAX_AGE_MS) {
          window.localStorage.removeItem(SAVED_SESSION_KEY);
          return false;
        }

        set({
          savedSession: parsed,
          currentQuestionIndex: parsed.currentQuestionIndex,
          answers: parsed.answers,
          sessionStartedAt: startedAtMs,
          sessionEndedAt: null,
          sessionComplete: false,
        });
        return true;
      },

      /**
       * Wipe the saved session — call on quiz completion or a
       * fresh-visit reset. Leaves the rest of the store intact.
       */
      clearSession: () => {
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(SAVED_SESSION_KEY);
          } catch {
            // ignore
          }
        }
        set({
          savedSession: null,
          currentQuestionIndex: 0,
          answers: {},
        });
      },
    }),
    {
      name: 'medz-chapter-quiz-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        answers: state.answers,
        currentQuestionIndex: state.currentQuestionIndex,
        sessionComplete: state.sessionComplete,
        sessionStartedAt: state.sessionStartedAt,
        sessionEndedAt: state.sessionEndedAt,
        filterQuestionIds: state.filterQuestionIds,
        lastResult: state.lastResult,
        savedSession: state.savedSession,
        mistakeQuestionIdsByChapter: state.mistakeQuestionIdsByChapter,
      }),
    }
  )
);
