import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CustomExamResult } from '@/lib/custom-exam-api';

/**
 * Client state for the Custom Exam quiz page — the counterpart of
 * lib/chapter-quiz-store.ts, with the same action names so the cloned
 * quiz page reads the same.
 *
 * One deliberate difference: the SERVER (custom_exam_progress) is the
 * source of truth for an unfinished exam. The quiz page always starts
 * from GET /api/student/custom-exam/[examId] and calls
 * `hydrateFromServer`, so — unlike the chapter store — answers and the
 * position are NOT persisted in the browser. That removes the whole
 * class of "stale local answers from another exam" bugs; there is no
 * "fresh start" handshake either, because an exam's question set is
 * fixed when it is created.
 *
 * Only `lastResult` is persisted: the results page renders from it after
 * the navigation (and survives a reload), exactly like the chapter flow.
 */

/** The finished exam, plus what the results page needs to offer "Solve again" / "Practice mistakes". */
export type ExamSessionResult = CustomExamResult & {
  examId: string;
  moduleCode: string;
  moduleName: string;
  /** Chapters the exam was drawn from (for "Solve again"). */
  chapterIds: string[];
};

export type CustomExamState = {
  /** The exam the in-memory state below belongs to. */
  examId: string | null;
  currentQuestionIndex: number;
  answers: Record<number, string>;
  sessionComplete: boolean;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  lastResult: ExamSessionResult | null;

  answerQuestion: (questionId: number, choiceId: string) => void;
  nextQuestion: (totalQuestions: number) => void;
  jumpToQuestion: (index: number) => void;
  completeSession: () => void;
  setLastResult: (result: ExamSessionResult) => void;
  /** Replace local state with what the server has saved for this exam. */
  hydrateFromServer: (
    examId: string,
    saved: { answers: Record<string, string>; currentQuestionIndex: number }
  ) => void;
  /** Reset the in-progress state — on completion. Leaves `lastResult`. */
  clearSession: () => void;
};

const initialState = {
  examId: null as string | null,
  currentQuestionIndex: 0,
  answers: {} as Record<number, string>,
  sessionComplete: false,
  sessionStartedAt: null as number | null,
  sessionEndedAt: null as number | null,
  lastResult: null as ExamSessionResult | null,
};

export const useCustomExamStore = create<CustomExamState>()(
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

      completeSession: () => set({ sessionComplete: true, sessionEndedAt: Date.now() }),

      setLastResult: (result) => set({ lastResult: result }),

      hydrateFromServer: (examId, saved) => {
        // Answers arrive keyed by string question id (JSON); the store
        // keys them by number.
        const answers: Record<number, string> = {};
        for (const [key, choice] of Object.entries(saved.answers)) {
          const id = Number(key);
          if (Number.isInteger(id)) answers[id] = choice;
        }
        set({
          examId,
          answers,
          currentQuestionIndex: Math.max(0, saved.currentQuestionIndex),
          sessionStartedAt: Date.now(),
          sessionEndedAt: null,
          sessionComplete: false,
        });
      },

      clearSession: () =>
        set({ examId: null, currentQuestionIndex: 0, answers: {}, sessionComplete: false }),
    }),
    {
      name: 'medz-custom-exam-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionStartedAt: state.sessionStartedAt,
        sessionEndedAt: state.sessionEndedAt,
        lastResult: state.lastResult,
      }),
    }
  )
);
