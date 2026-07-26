import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type QuizMode = 'fullscreen' | 'split';

export type SubmissionResult = {
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

export type SavedSession = {
  subjectId: string;
  currentQuestionIndex: number;
  answers: Record<number, string>;
  bookmarks: number[];
  notes: Record<number, string>;
  startedAt: string;
};

const SAVED_SESSION_KEY = 'medz_quiz_session';
const SAVED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type QuizState = {
  currentQuestionIndex: number;
  answers: Record<number, string>;
  bookmarks: number[];
  notes: Record<number, string>;
  quizMode: QuizMode;
  sessionComplete: boolean;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  filterQuestionIds: number[] | null;
  lastResult: SubmissionResult | null;
  savedSession: SavedSession | null;
  /** Question IDs the student got wrong across ALL past sessions.
   *  Persists so "Quiz on mistakes" is available anytime, not just
   *  right after finishing a challenge. */
  mistakeQuestionIds: number[];

  answerQuestion: (questionId: number, choiceId: string) => void;
  toggleBookmark: (questionId: number) => void;
  setNote: (questionId: number, note: string) => void;
  nextQuestion: (totalQuestions: number) => void;
  prevQuestion: () => void;
  jumpToQuestion: (index: number) => void;
  setQuizMode: (mode: QuizMode) => void;
  completeSession: () => void;
  resetSession: () => void;
  startSession: () => void;
  startMistakeSession: (mistakeIds: number[]) => void;
  clearFilter: () => void;
  setLastResult: (result: SubmissionResult) => void;
  /** Merge new mistake IDs into the persistent mistake pool. */
  recordMistakes: (ids: number[]) => void;
  /** Remove IDs the student has now answered correctly. */
  clearMistakes: (ids: number[]) => void;
  saveSession: (subjectId: string) => void;
  loadSession: (subjectId: string) => boolean;
  clearSession: () => void;
};

const initialState = {
  currentQuestionIndex: 0,
  answers: {} as Record<number, string>,
  bookmarks: [] as number[],
  notes: {} as Record<number, string>,
  quizMode: 'split' as QuizMode,
  sessionComplete: false,
  sessionStartedAt: null as number | null,
  sessionEndedAt: null as number | null,
  filterQuestionIds: null as number[] | null,
  lastResult: null as SubmissionResult | null,
  savedSession: null as SavedSession | null,
  mistakeQuestionIds: [] as number[],
};

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      ...initialState,

      answerQuestion: (questionId, choiceId) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: choiceId },
        })),

      toggleBookmark: (questionId) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(questionId)
            ? state.bookmarks.filter((id) => id !== questionId)
            : [...state.bookmarks, questionId],
        })),

      setNote: (questionId, note) =>
        set((state) => ({
          notes: { ...state.notes, [questionId]: note },
        })),

      nextQuestion: (totalQuestions) => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex >= totalQuestions - 1) {
          set({ sessionComplete: true, sessionEndedAt: Date.now() });
          return;
        }
        set({ currentQuestionIndex: currentQuestionIndex + 1 });
      },

      prevQuestion: () => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex <= 0) return;
        set({ currentQuestionIndex: currentQuestionIndex - 1, sessionComplete: false });
      },

      jumpToQuestion: (index) =>
        set({ currentQuestionIndex: Math.max(0, index), sessionComplete: false }),

      setQuizMode: (mode) => set({ quizMode: mode }),

      completeSession: () =>
        set({ sessionComplete: true, sessionEndedAt: Date.now() }),

      resetSession: () => set({ ...initialState }),

      startSession: () =>
        set({
          sessionStartedAt: Date.now(),
          sessionEndedAt: null,
          filterQuestionIds: null,
          answers: {},
          currentQuestionIndex: 0,
          sessionComplete: false,
        }),

      startMistakeSession: (mistakeIds) =>
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

      recordMistakes: (ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const merged = new Set(state.mistakeQuestionIds);
          for (const id of ids) merged.add(id);
          return { mistakeQuestionIds: Array.from(merged) };
        }),

      clearMistakes: (ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const remove = new Set(ids);
          return {
            mistakeQuestionIds: state.mistakeQuestionIds.filter(
              (id) => !remove.has(id)
            ),
          };
        }),

      /**
       * Snapshot the current quiz state to the store AND localStorage.
       * Called from the Exit Confirmation Modal so the student can
       * pick up exactly where they left off on the next visit.
       */
      saveSession: (subjectId) => {
        const state = get();
        const session: SavedSession = {
          subjectId,
          currentQuestionIndex: state.currentQuestionIndex,
          answers: state.answers,
          bookmarks: state.bookmarks,
          notes: state.notes,
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
            // localStorage can be unavailable in private mode — that's fine,
            // the in-memory copy in `savedSession` still works for this tab.
          }
        }
      },

      /**
       * Try to restore a saved session for `subjectId`. Returns true
       * when a session was found and merged into the store.
       *
       * Safety checks:
       *   - subjectId must match (we don't auto-restore Anatomy if
       *     the saved session was Histology).
       *   - startedAt must be within the last 24 hours; older
       *     sessions are removed from storage.
       */
      loadSession: (subjectId) => {
        if (typeof window === 'undefined') return false;
        let raw: string | null = null;
        try {
          raw = window.localStorage.getItem(SAVED_SESSION_KEY);
        } catch {
          return false;
        }
        if (!raw) return false;

        let parsed: SavedSession;
        try {
          parsed = JSON.parse(raw) as SavedSession;
        } catch {
          window.localStorage.removeItem(SAVED_SESSION_KEY);
          return false;
        }

        if (parsed.subjectId !== subjectId) return false;

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
          bookmarks: parsed.bookmarks,
          notes: parsed.notes,
          sessionStartedAt: startedAtMs,
          sessionEndedAt: null,
          sessionComplete: false,
        });
        return true;
      },

      /**
       * Wipe the saved session — call this on quiz completion,
       * on a "Start Fresh" click, or when a session is force-ended
       * by anti-cheat. Leaves the rest of the store intact.
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
          bookmarks: [],
          notes: {},
        });
      },
    }),
    {
      name: 'medz-quiz-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        answers: state.answers,
        bookmarks: state.bookmarks,
        notes: state.notes,
        quizMode: state.quizMode,
        currentQuestionIndex: state.currentQuestionIndex,
        sessionComplete: state.sessionComplete,
        sessionStartedAt: state.sessionStartedAt,
        sessionEndedAt: state.sessionEndedAt,
        filterQuestionIds: state.filterQuestionIds,
        lastResult: state.lastResult,
        savedSession: state.savedSession,
        mistakeQuestionIds: state.mistakeQuestionIds,
      }),
    }
  )
);
