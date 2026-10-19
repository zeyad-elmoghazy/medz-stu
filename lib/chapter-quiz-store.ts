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

export type ChapterQuizState = {
  currentQuestionIndex: number;
  answers: Record<number, string>;
  sessionComplete: boolean;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  filterQuestionIds: number[] | null;
  lastResult: ChapterSubmissionResult | null;
  /**
   * Set by startSession / startMistakeSession — the entry points that
   * mean "begin this chapter fresh" (Start Quiz, Solve Again, Practice
   * mistakes). The quiz page reads it on mount: when set it discards
   * any server-saved attempt instead of resuming it. Every other way
   * of arriving (the catalogue's Continue link, a reload, a direct
   * URL) leaves it false, so a saved attempt is resumed. Deliberately
   * NOT persisted: if it were, a start that never reached the quiz
   * page could later wipe an attempt the student meant to continue.
   */
  pendingFreshStart: boolean;
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
  /** Restore an attempt saved on the server (see chapter_quiz_progress). */
  hydrateFromProgress: (progress: {
    answers: Record<string, string>;
    currentQuestionIndex: number;
    questionIds: number[] | null;
  }) => void;
  clearPendingFreshStart: () => void;
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
  pendingFreshStart: false,
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
          pendingFreshStart: true,
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
            pendingFreshStart: true,
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
       * Restore an attempt saved on the server (chapter_quiz_progress).
       * Answers arrive keyed by string question id (JSON); the store
       * keys them by number.
       */
      hydrateFromProgress: (progress) => {
        const answers: Record<number, string> = {};
        for (const [key, choice] of Object.entries(progress.answers)) {
          const id = Number(key);
          if (Number.isInteger(id)) answers[id] = choice;
        }
        set({
          answers,
          currentQuestionIndex: Math.max(0, progress.currentQuestionIndex),
          filterQuestionIds:
            progress.questionIds && progress.questionIds.length > 0
              ? progress.questionIds
              : null,
          sessionStartedAt: Date.now(),
          sessionEndedAt: null,
          sessionComplete: false,
          pendingFreshStart: false,
        });
      },

      clearPendingFreshStart: () => set({ pendingFreshStart: false }),

      /**
       * Reset the in-progress quiz state — on completion or a fresh
       * start. Leaves the rest of the store intact.
       */
      clearSession: () => set({ currentQuestionIndex: 0, answers: {} }),
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
        mistakeQuestionIdsByChapter: state.mistakeQuestionIdsByChapter,
      }),
    }
  )
);
