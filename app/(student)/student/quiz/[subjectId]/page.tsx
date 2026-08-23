'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Bot,
  Brain,
  Check,
  Copy,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  LogOut,
  Maximize2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  StickyNote,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useQuizStore } from '@/lib/store';
import { isDemoMode } from '@/lib/demo-profile';
import {
  histologyQuestions,
  histologySubject,
  type HistologyQuestion,
} from '@/data/histology-questions';
import { cn, letterFor } from '@/lib/utils';
import { AITutorSkeleton } from '@/components/skeletons/AITutorSkeleton';

// Heavy panels are dynamic-imported so their JS isn't part of the
// initial quiz bundle. The user only ever opens them on demand.
const RichTextEditor = dynamic(
  () => import('@/components/quiz/NotesEditor'),
  {
    loading: () => (
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md p-5 text-sm text-text-muted"
        style={{ backgroundColor: '#0F0F1A', borderLeft: '1px solid #1E1E2E' }}
      >
        Loading editor...
      </div>
    ),
    ssr: false,
  }
);

const AITutorPanel = dynamic(
  () => import('@/components/quiz/AITutor'),
  {
    loading: () => <AITutorSkeleton />,
    ssr: false,
  }
);

export default function QuizEnginePage() {
  const router = useRouter();
  const params = useParams<{ subjectId: string }>();

  const currentQuestionIndex = useQuizStore((s) => s.currentQuestionIndex);
  const answers = useQuizStore((s) => s.answers);
  const bookmarks = useQuizStore((s) => s.bookmarks);
  const notes = useQuizStore((s) => s.notes);
  const filterQuestionIds = useQuizStore((s) => s.filterQuestionIds);
  const sessionStartedAt = useQuizStore((s) => s.sessionStartedAt);
  const answerQuestion = useQuizStore((s) => s.answerQuestion);
  const toggleBookmark = useQuizStore((s) => s.toggleBookmark);
  const setNote = useQuizStore((s) => s.setNote);
  const nextQuestion = useQuizStore((s) => s.nextQuestion);
  const completeSession = useQuizStore((s) => s.completeSession);
  const setLastResult = useQuizStore((s) => s.setLastResult);
  const recordMistakes = useQuizStore((s) => s.recordMistakes);
  const clearMistakes = useQuizStore((s) => s.clearMistakes);
  const saveSession = useQuizStore((s) => s.saveSession);
  const clearSession = useQuizStore((s) => s.clearSession);
  const jumpToQuestion = useQuizStore((s) => s.jumpToQuestion);
  const startSession = useQuizStore((s) => s.startSession);

  const questions = useMemo(() => {
    if (filterQuestionIds && filterQuestionIds.length > 0) {
      const idSet = new Set(filterQuestionIds);
      return histologyQuestions.filter((q) => idSet.has(q.id));
    }
    return histologyQuestions;
  }, [filterQuestionIds]);

  const totalQuestions = Math.max(questions.length, 1);
  const safeIndex = Math.min(Math.max(currentQuestionIndex, 0), totalQuestions - 1);
  const currentQuestion = questions[safeIndex] ?? histologyQuestions[0];

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [showTutorPanel, setShowTutorPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'explanation' | 'reference'>('explanation');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [violationsCount, setViolationsCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);

  // Tracks whether the most recent fullscreen exit was the user
  // pressing the Exit button (intentional) vs an Escape/browser
  // event (unintentional, counts as a violation).
  const intentionalExit = useRef(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const submittedRef = useRef(false);
  const intentionalExitRef = useRef(false);
  const wasFullscreenRef = useRef(false);

  useEffect(() => {
    // If the store already has answers, the user is resuming a
    // saved session — show the toast and keep the state as-is.
    // Otherwise this is a fresh visit: wipe any stale saved
    // session and start the timer. useQuizStore is backed by
    // localStorage (see lib/store.ts's persist middleware), so this
    // read is SSR-unsafe and can only happen post-mount.
    const existingAnswers = useQuizStore.getState().answers;
    if (Object.keys(existingAnswers).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsResuming(true);
    } else {
      clearSession();
      if (!sessionStartedAt) {
        startSession();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the resume toast after 2s.
  useEffect(() => {
    if (!isResuming) return;
    const t = setTimeout(() => setIsResuming(false), 2000);
    return () => clearTimeout(t);
  }, [isResuming]);

  useEffect(() => {
    if (currentQuestionIndex >= totalQuestions) {
      jumpToQuestion(0);
    }
  }, [currentQuestionIndex, totalQuestions, jumpToQuestion]);

  // selectedChoice is also directly set by PhaseOne while the user is
  // mid-selection (before submit), so it can't be replaced by a value
  // derived from `answers` alone — this only needs to resync it when
  // navigating to a different question or after a real answer commit,
  // which is exactly what the dependency array below scopes it to.
  useEffect(() => {
    const persisted = answers[currentQuestion.id];
    if (persisted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedChoice(persisted);
      setSubmitted(true);
      submittedRef.current = true;
    } else {
      setSelectedChoice(null);
      setSubmitted(false);
      submittedRef.current = false;
    }
  }, [currentQuestion.id, answers]);

  const enterFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    if (!el.requestFullscreen) {
      setFullscreenSupported(false);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser requires user gesture — the manual "Enter focus mode" button covers this.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    intentionalExitRef.current = true;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore — toggle back to phase 2 either way.
    }
  }, []);

  // Synchronizes the browser's Fullscreen API with question/submit
  // state — a genuine external-system side effect, not a state
  // update. Flagged only because enterFullscreen's one fallback path
  // (Fullscreen API unsupported) calls setFullscreenSupported.
  useEffect(() => {
    if (!submitted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      enterFullscreen();
    }
  }, [submitted, currentQuestion.id, enterFullscreen]);

  useEffect(() => {
    function onChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        wasFullscreenRef.current = true;
        return;
      }

      // Silent programmatic exit (e.g. after submit) — never
      // shows any modal. The submit flow flips this flag.
      if (intentionalExitRef.current) {
        intentionalExitRef.current = false;
        return;
      }

      // Already past the Phase-1 fullscreen — split view doesn't
      // need fullscreen, so no warning here.
      if (submittedRef.current || !wasFullscreenRef.current) {
        return;
      }

      // User clicked the Exit button — show the save modal.
      if (intentionalExit.current) {
        intentionalExit.current = false;
        setShowExitModal(true);
        return;
      }

      // Unintentional exit (Escape, browser UI, alt-tab in some
      // browsers). Count it as an integrity violation and warn.
      incrementViolations();
      setShowViolationWarning(true);
    }

    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function incrementViolations() {
    setViolationsCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        // Anti-cheat force-end. Wipe the saved session — we don't
        // want the student to resume after being flagged.
        clearSession();
        intentionalExitRef.current = true;
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        completeSession();
        router.push('/student/dashboard');
      }
      return next;
    });
  }

  function handleExitButtonClick() {
    if (submitting) return;
    intentionalExit.current = true;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // If the browser refuses the exit, fall back to showing
        // the modal anyway so the student isn't trapped.
        intentionalExit.current = false;
        setShowExitModal(true);
      });
    } else {
      // Not in fullscreen — just show the modal directly.
      setShowExitModal(true);
    }
  }

  function handleSaveAndExit() {
    const subjectId = (params.subjectId as string) ?? histologySubject.id;
    saveSession(subjectId);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      intentionalExitRef.current = true;
      document.exitFullscreen().catch(() => {});
    }
    setShowExitModal(false);
    router.push('/student/dashboard');
  }

  function handleContinueChallenge() {
    setShowExitModal(false);
    // Only re-enter fullscreen for the answer phase; the review
    // phase (submitted) is intentionally windowed.
    if (!submittedRef.current) enterFullscreen();
  }

  function handleViolationDismiss() {
    setShowViolationWarning(false);
    enterFullscreen();
  }

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && showNotesPanel) {
        setShowNotesPanel(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNotesPanel]);

  const isCorrect = submitted && selectedChoice === currentQuestion.correctAnswer;
  const isLastQuestion = safeIndex === totalQuestions - 1;
  const progressPct = Math.round(((safeIndex + (submitted ? 1 : 0)) / totalQuestions) * 100);
  const isBookmarked = bookmarks.includes(currentQuestion.id);
  const currentNote = notes[currentQuestion.id] ?? '';

  function handleSubmit() {
    if (!selectedChoice || submitted) return;
    submittedRef.current = true;
    answerQuestion(currentQuestion.id, selectedChoice);
    setSubmitted(true);
    exitFullscreen();
  }

  async function handleNext() {
    if (isLastQuestion) {
      await handleQuizComplete();
      return;
    }
    setSelectedChoice(null);
    setSubmitted(false);
    submittedRef.current = false;
    nextQuestion(totalQuestions);
  }

  /**
   * Finalize the quiz: in demo mode we score locally and pass
   * the score in the URL; in real mode we POST to /api/quiz/submit,
   * stash the per-question result in the store for the results
   * page, and route. Errors set `submitError` so the student can
   * retry without losing their answers.
   */
  async function handleQuizComplete() {
    if (submitting) return;
    setSubmitError(null);

    const subjectId = (params.subjectId as string) ?? histologySubject.id;
    const startedAt = new Date(
      sessionStartedAt ?? Date.now()
    ).toISOString();

    // String-keyed payload — the server schema validates it
    // with z.record(z.string(), z.string()).
    const stringKeyedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      stringKeyedAnswers[String(k)] = v;
    }

    if (isDemoMode()) {
      // Build a full result snapshot BEFORE clearSession() wipes
      // `answers` — otherwise the results page reads nothing and
      // shows every question as skipped.
      const scoredQuestions = questions;
      const results = scoredQuestions.map((q) => {
        const chosen = answers[q.id] ?? null;
        return {
          questionId: q.id,
          isCorrect: chosen === q.correctAnswer,
          chosen,
          correct: q.correctAnswer,
        };
      });
      const score = results.filter((r) => r.isCorrect).length;
      const total = scoredQuestions.length;
      const attempted = results.filter((r) => r.chosen !== null).length;

      setLastResult({
        sessionId: `demo-${Date.now()}`,
        score,
        total,
        accuracy: attempted === 0 ? 0 : Math.round((score / attempted) * 100),
        results,
      });

      const wrongIds = results.filter((r) => r.chosen !== null && !r.isCorrect).map((r) => r.questionId);
      const correctIds = results.filter((r) => r.isCorrect).map((r) => r.questionId);
      recordMistakes(wrongIds);
      clearMistakes(correctIds);

      completeSession();
      clearSession();
      router.push(
        `/student/results/${subjectId}?score=${score}&total=${total}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subjectId,
          answers: stringKeyedAnswers,
          questionIds: questions.map((q) => q.id),
          startedAt,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Submission failed (${res.status})`);
      }

      const data = (await res.json()) as {
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

      setLastResult(data);
      const wrongIds = data.results.filter((r) => r.chosen !== null && !r.isCorrect).map((r) => r.questionId);
      const correctIds = data.results.filter((r) => r.isCorrect).map((r) => r.questionId);
      recordMistakes(wrongIds);
      clearMistakes(correctIds);
      completeSession();
      clearSession();
      router.push(`/student/results/${subjectId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Failed to save your results. Check your connection.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    const lines: string[] = [currentQuestion.question, ''];
    currentQuestion.choices.forEach((c, idx) => {
      lines.push(`${letterFor(idx)}. ${c.text}`);
    });
    const correctIdx = currentQuestion.choices.findIndex(
      (c) => c.id === currentQuestion.correctAnswer
    );
    if (correctIdx >= 0) {
      lines.push('', `Answer: ${letterFor(correctIdx)}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — silent.
    }
  }

  return (
    <main className="relative min-h-screen w-full" style={{ backgroundColor: '#09090E' }}>
      <TopBar
        currentIndex={safeIndex}
        total={totalQuestions}
        progressPct={progressPct}
        isBookmarked={isBookmarked}
        onBookmarkToggle={() => toggleBookmark(currentQuestion.id)}
        onNotesOpen={() => setShowNotesPanel(true)}
        onTutorOpen={() => setShowTutorPanel(true)}
        showFullscreenButton={!isFullscreen && fullscreenSupported && !submitted}
        onRequestFullscreen={enterFullscreen}
        subjectName={histologySubject.name}
        onExit={handleExitButtonClick}
      />

      <AnimatePresence>
        {isResuming && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed left-1/2 top-20 z-30 -translate-x-1/2"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-purple-300"
              style={{
                backgroundColor: 'rgba(124,58,237,0.2)',
                border: '1px solid rgba(124,58,237,0.3)',
                boxShadow: '0 0 18px rgba(124,58,237,0.25)',
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Resuming your session...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {submitError && (
          <motion.div
            key="submit-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mt-4 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#FCA5A5',
            }}
          >
            <span>{submitError}</span>
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                handleQuizComplete();
              }}
              disabled={submitting}
              className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white disabled:opacity-60"
              style={{
                backgroundColor: '#EF4444',
                boxShadow: '0 0 14px rgba(239,68,68,0.4)',
              }}
            >
              {submitting ? 'Retrying…' : 'Try again'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.section
            key={`phase1-${currentQuestion.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mx-auto w-full max-w-3xl px-6 pt-12 pb-16"
          >
            <PhaseOne
              question={currentQuestion}
              selectedChoice={selectedChoice}
              setSelectedChoice={setSelectedChoice}
              onSubmit={handleSubmit}
            />
          </motion.section>
        ) : (
          <motion.section
            key={`phase2-${currentQuestion.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 px-6 pt-10 pb-20 lg:grid-cols-[3fr_2fr]"
          >
            <motion.div
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <PhaseTwoLeft
                question={currentQuestion}
                selectedChoice={selectedChoice}
                isCorrect={isCorrect}
                isBookmarked={isBookmarked}
                onBookmarkToggle={() => toggleBookmark(currentQuestion.id)}
                onNotesOpen={() => setShowNotesPanel(true)}
                onCopy={handleCopy}
                copied={copied}
                onNext={handleNext}
                isLastQuestion={isLastQuestion}
                submitting={submitting}
              />
            </motion.div>

            <motion.div
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <PhaseTwoRight
                question={currentQuestion}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotesPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowNotesPanel(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <RichTextEditor
              // Remounts on question change instead of resetting via an
              // effect — see NotesEditor.tsx. Also means a pending debounced
              // save flushes through its unmount cleanup rather than being
              // silently discarded.
              key={currentQuestion.id}
              topic={currentQuestion.topic}
              initialValue={currentNote}
              onChange={(value) => setNote(currentQuestion.id, value)}
              onClose={() => setShowNotesPanel(false)}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTutorPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowTutorPanel(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md p-4">
              <AITutorPanel
                questionStem={currentQuestion.question}
                topic={currentQuestion.topic}
                onClose={() => setShowTutorPanel(false)}
              />
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExitModal && (
          <ExitConfirmationModal
            answeredCount={Object.keys(answers).length}
            totalCount={totalQuestions}
            correctCount={Object.entries(answers).reduce((sum, [qid, choice]) => {
              const q = questions.find((qq) => qq.id === Number(qid));
              return q && q.correctAnswer === choice ? sum + 1 : sum;
            }, 0)}
            currentIndex={safeIndex}
            onSaveAndExit={handleSaveAndExit}
            onContinue={handleContinueChallenge}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showViolationWarning && (
          <ViolationWarning
            violations={violationsCount}
            onDismiss={handleViolationDismiss}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function TopBar({
  currentIndex,
  total,
  progressPct,
  isBookmarked,
  onBookmarkToggle,
  onNotesOpen,
  onTutorOpen,
  showFullscreenButton,
  onRequestFullscreen,
  subjectName,
  onExit,
}: {
  currentIndex: number;
  total: number;
  progressPct: number;
  isBookmarked: boolean;
  onBookmarkToggle: () => void;
  onNotesOpen: () => void;
  onTutorOpen: () => void;
  showFullscreenButton: boolean;
  onRequestFullscreen: () => void;
  subjectName: string;
  onExit: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{
        backgroundColor: 'rgba(9, 9, 14, 0.88)',
        borderBottom: '1px solid #1E1E2E',
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-4">
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Active block
          </span>
          <span className="text-sm font-semibold text-white">{subjectName}</span>
        </div>

        <div className="flex flex-1 items-center gap-4">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #7C3AED 0%, #9F67FF 100%)',
                boxShadow: '0 0 16px rgba(124,58,237,0.55)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-text-muted">
            Question{' '}
            <span className="text-white">{currentIndex + 1}</span> of {total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {showFullscreenButton && (
            <IconButton
              label="Enter focus mode"
              onClick={onRequestFullscreen}
              icon={<Maximize2 className="h-4 w-4" />}
            />
          )}
          <button
            type="button"
            onClick={onExit}
            title="Exit the challenge"
            className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </button>
          <span
            aria-hidden
            className="mx-1 h-5 w-px"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
          <IconButton
            label={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
            onClick={onBookmarkToggle}
            active={isBookmarked}
            icon={
              isBookmarked ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )
            }
          />
          <IconButton
            label="Open notes"
            onClick={onNotesOpen}
            icon={<StickyNote className="h-4 w-4" />}
          />
          <IconButton
            label="Ask the AI tutor"
            onClick={onTutorOpen}
            icon={<Bot className="h-4 w-4" />}
          />
        </div>
      </div>
    </header>
  );
}

function IconButton({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-lg transition',
        active
          ? 'text-violet-200'
          : 'text-text-muted hover:text-white'
      )}
      style={{
        border: '1px solid #1E1E2E',
        backgroundColor: active ? 'rgba(124,58,237,0.18)' : '#0F0F1A',
        boxShadow: active ? '0 0 14px rgba(124,58,237,0.35)' : undefined,
      }}
    >
      {icon}
    </button>
  );
}

function PhaseOne({
  question,
  selectedChoice,
  setSelectedChoice,
  onSubmit,
}: {
  question: HistologyQuestion;
  selectedChoice: string | null;
  setSelectedChoice: Dispatch<SetStateAction<string | null>>;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200"
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.18)',
            border: '1px solid rgba(159, 103, 255, 0.4)',
          }}
        >
          <Sparkles className="h-3 w-3" /> {question.topic}
        </span>
      </div>

      <h1 className="text-2xl font-semibold leading-relaxed text-white md:text-[28px] md:leading-snug">
        {question.question}
      </h1>

      <div className="space-y-3">
        {question.choices.map((choice, idx) => {
          const isSelected = selectedChoice === choice.id;
          return (
            <motion.button
              key={choice.id}
              type="button"
              onClick={() => setSelectedChoice(choice.id)}
              whileTap={{ scale: 0.995 }}
              className={cn(
                'flex w-full items-start gap-4 rounded-xl text-left transition',
                'p-4'
              )}
              style={{
                backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.12)' : '#0F0F1A',
                border: `1px solid ${isSelected ? '#7C3AED' : '#1E1E2E'}`,
                boxShadow: isSelected
                  ? '0 0 24px rgba(124,58,237,0.35)'
                  : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = '#7C3AED';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = '#1E1E2E';
                }
              }}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-semibold transition',
                  isSelected ? 'bg-violet-500 text-white' : 'bg-white/5 text-text-muted'
                )}
              >
                {letterFor(idx)}
              </span>
              <span className="pt-1 text-sm leading-relaxed text-white md:text-base">
                {choice.text}
              </span>
            </motion.button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!selectedChoice}
        className={cn(
          'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        style={{
          backgroundColor: '#7C3AED',
          boxShadow: selectedChoice ? '0 0 28px rgba(124,58,237,0.55)' : 'none',
        }}
      >
        Submit Answer
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function PhaseTwoLeft({
  question,
  selectedChoice,
  isCorrect,
  isBookmarked,
  onBookmarkToggle,
  onNotesOpen,
  onCopy,
  copied,
  onNext,
  isLastQuestion,
  submitting,
}: {
  question: HistologyQuestion;
  selectedChoice: string | null;
  isCorrect: boolean;
  isBookmarked: boolean;
  onBookmarkToggle: () => void;
  onNotesOpen: () => void;
  onCopy: () => void;
  copied: boolean;
  onNext: () => void;
  isLastQuestion: boolean;
  submitting: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col gap-6 rounded-2xl p-6 lg:p-8"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <ResultBadge isCorrect={isCorrect} />

      <h2 className="text-xl font-semibold leading-relaxed text-white md:text-2xl md:leading-snug">
        {question.question}
      </h2>

      <div className="space-y-3">
        {question.choices.map((choice, idx) => {
          const isCorrectChoice = choice.id === question.correctAnswer;
          const isUserChoice = selectedChoice === choice.id;
          const isWrongUserChoice = isUserChoice && !isCorrectChoice;

          let bg = '#0A0A12';
          let border = '#1E1E2E';
          let badgeBg = 'rgba(255,255,255,0.05)';
          let badgeText = 'text-text-muted';
          let icon: React.ReactNode = letterFor(idx);

          if (isCorrectChoice) {
            bg = 'rgba(16, 185, 129, 0.08)';
            border = '#10B981';
            badgeBg = '#10B981';
            badgeText = 'text-white';
            icon = <Check className="h-4 w-4" />;
          } else if (isWrongUserChoice) {
            bg = 'rgba(239, 68, 68, 0.08)';
            border = '#EF4444';
            badgeBg = '#EF4444';
            badgeText = 'text-white';
            icon = <X className="h-4 w-4" />;
          }

          return (
            <div
              key={choice.id}
              className="rounded-xl p-4"
              style={{ backgroundColor: bg, border: `1px solid ${border}` }}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-semibold',
                    badgeText
                  )}
                  style={{ backgroundColor: badgeBg }}
                >
                  {icon}
                </span>
                <div className="flex-1 space-y-1.5 pt-1">
                  <p
                    className={cn(
                      'text-sm leading-relaxed md:text-base',
                      isCorrectChoice
                        ? 'text-emerald-100'
                        : isWrongUserChoice
                          ? 'text-rose-100'
                          : 'text-text-primary'
                    )}
                  >
                    {choice.text}
                  </p>
                  {!isCorrectChoice && (
                    <p className="text-[11px] italic leading-relaxed text-text-muted">
                      {question.choiceRationales?.[choice.id]
                        ? stripPrefix(question.choiceRationales[choice.id])
                        : whyDistractorIsWrong(question, choice.id)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-5"
        style={{ borderColor: '#1E1E2E' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton
            label={isBookmarked ? 'Bookmarked' : 'Bookmark'}
            onClick={onBookmarkToggle}
            active={isBookmarked}
            icon={
              isBookmarked ? (
                <BookmarkCheck className="h-3.5 w-3.5" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )
            }
          />
          <ToolbarButton
            label="Notes"
            onClick={onNotesOpen}
            icon={<StickyNote className="h-3.5 w-3.5" />}
          />
          <ToolbarButton
            label={copied ? 'Copied!' : 'Copy'}
            onClick={onCopy}
            icon={
              copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )
            }
          />
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={submitting}
          className="group inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: '#7C3AED',
            boxShadow: '0 0 24px rgba(124,58,237,0.45)',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              {isLastQuestion ? 'See Results' : 'Next Question'}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ResultBadge({ isCorrect }: { isCorrect: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
      style={
        isCorrect
          ? {
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#6EE7B7',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              boxShadow: '0 0 18px rgba(16, 185, 129, 0.35)',
            }
          : {
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#FCA5A5',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              boxShadow: '0 0 18px rgba(239, 68, 68, 0.35)',
            }
      }
    >
      {isCorrect ? (
        <>
          <Check className="h-3.5 w-3.5" /> Correct
        </>
      ) : (
        <>
          <X className="h-3.5 w-3.5" /> Incorrect
        </>
      )}
    </motion.div>
  );
}

function ToolbarButton({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition',
        active ? 'text-violet-200' : 'text-text-muted hover:text-white'
      )}
      style={{
        border: '1px solid #1E1E2E',
        backgroundColor: active ? 'rgba(124,58,237,0.15)' : '#0A0A12',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PhaseTwoRight({
  question,
  activeTab,
  setActiveTab,
}: {
  question: HistologyQuestion;
  activeTab: 'explanation' | 'reference';
  setActiveTab: Dispatch<SetStateAction<'explanation' | 'reference'>>;
}) {
  return (
    <div
      className="flex h-full flex-col rounded-2xl"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div
        className="flex items-center gap-1 p-2"
        style={{ borderBottom: '1px solid #1E1E2E' }}
      >
        <TabButton
          active={activeTab === 'explanation'}
          onClick={() => setActiveTab('explanation')}
          icon={<Brain className="h-3.5 w-3.5" />}
          label="Explanation"
        />
        <TabButton
          active={activeTab === 'reference'}
          onClick={() => setActiveTab('reference')}
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Reference"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AnimatePresence mode="wait">
          {activeTab === 'explanation' ? (
            <motion.div
              key="explanation"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <StructuredExplanation question={question} />
            </motion.div>
          ) : (
            <motion.div
              key="reference"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <ReferenceCard
                reference={question.reference}
                imageUrl={question.referenceImageUrl ?? null}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-[0.16em] transition',
        active ? 'text-white' : 'text-text-muted hover:text-white'
      )}
      style={{
        backgroundColor: active ? 'rgba(124,58,237,0.18)' : 'transparent',
        boxShadow: active ? '0 0 14px rgba(124,58,237,0.3)' : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function StructuredExplanation({ question }: { question: HistologyQuestion }) {
  const sentences = useMemo(
    () =>
      question.explanation
        .split(/(?<=[.])\s+(?=[A-Z])/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [question.explanation]
  );

  const summary = sentences[0] ?? question.explanation;
  const details = sentences.slice(1);
  const correctChoice = question.choices.find(
    (c) => c.id === question.correctAnswer
  );

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader icon={<Lightbulb className="h-3.5 w-3.5" />}>
          Key concept
        </SectionHeader>
        <p className="mt-2.5 text-sm leading-relaxed text-white">{summary}</p>
      </section>

      {details.length > 0 && (
        <section>
          <SectionHeader icon={<ListChecks className="h-3.5 w-3.5" />}>
            Why this answer
          </SectionHeader>
          <ul className="mt-2.5 space-y-2.5">
            {details.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-primary">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {question.choiceRationales && (
        <section>
          <SectionHeader icon={<ListChecks className="h-3.5 w-3.5" />}>
            Choice-by-choice
          </SectionHeader>
          <ul className="mt-2.5 space-y-2">
            {question.choices.map((c) => {
              const raw = question.choiceRationales?.[c.id];
              if (!raw) return null;
              const isCorrect = c.id === question.correctAnswer;
              return (
                <li
                  key={c.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: isCorrect
                      ? 'rgba(16,185,129,0.08)'
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${
                      isCorrect ? 'rgba(16,185,129,0.35)' : '#1E1E2E'
                    }`,
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      color: isCorrect ? '#6EE7B7' : '#FCA5A5',
                    }}
                  >
                    {c.id.toUpperCase()} · {isCorrect ? 'Correct' : 'Wrong'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-primary">
                    {stripPrefix(raw)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />}>
          Take-away
        </SectionHeader>
        <div
          className="mt-2.5 rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.08)',
            border: '1px solid rgba(159, 103, 255, 0.25)',
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300">
            Topic · {question.topic}
          </p>
          {correctChoice && (
            <p className="mt-2 text-sm leading-relaxed text-white">
              <span className="font-semibold text-violet-200">Correct answer:</span>{' '}
              {correctChoice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15 text-violet-200">
        {icon}
      </span>
      {children}
    </header>
  );
}

function ReferenceCard({
  reference,
  imageUrl,
}: {
  reference: string;
  imageUrl: string | null;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-6"
      style={{
        backgroundColor: '#1A1505',
        color: '#FAFAF5',
        border: '1px solid rgba(230, 217, 168, 0.18)',
        backgroundImage:
          'repeating-linear-gradient(transparent 0px, transparent 31px, rgba(230,217,168,0.07) 31px, rgba(230,217,168,0.07) 32px)',
      }}
    >
      <div
        className="flex items-center gap-2 pb-4"
        style={{ borderBottom: '1px dashed rgba(230, 217, 168, 0.25)' }}
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-full"
          style={{
            backgroundColor: 'rgba(230, 217, 168, 0.12)',
            color: '#E6D9A8',
          }}
        >
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: 'rgba(230, 217, 168, 0.7)' }}
          >
            Reference
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: '#E6D9A8' }}
          >
            From the Module Reference Book
          </span>
        </div>
      </div>

      {imageUrl && (
        <div
          className="mt-5 overflow-hidden rounded-lg"
          style={{
            border: '1px solid rgba(230, 217, 168, 0.25)',
            backgroundColor: '#FAFAF5',
          }}
        >
          {/* Plain <img> — bucket URLs aren't in next/image
              remotePatterns for arbitrary Supabase projects, and
              this way the browser fetches directly from the CDN. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Source page from the module reference book"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              maxHeight: '70vh',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      <p
        className="mt-5 font-handwritten leading-relaxed"
        style={{ fontSize: '1.4rem', color: '#FAFAF5' }}
      >
        {reference}
      </p>

      <p
        className="mt-6 text-right text-xs italic"
        style={{ color: 'rgba(230, 217, 168, 0.65)' }}
      >
        — Module Reference Book
      </p>
    </div>
  );
}

function ExitConfirmationModal({
  answeredCount,
  totalCount,
  correctCount,
  currentIndex,
  onSaveAndExit,
  onContinue,
}: {
  answeredCount: number;
  totalCount: number;
  correctCount: number;
  currentIndex: number;
  onSaveAndExit: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onContinue}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="exit-confirmation-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl mx-4"
        style={{
          backgroundColor: '#161B26',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <LogOut className="h-6 w-6 text-red-400" />
        </div>

        <h2
          id="exit-confirmation-title"
          className="mb-2 text-center text-xl font-bold text-white"
        >
          Exit Challenge?
        </h2>
        <p className="mb-2 text-center text-sm text-slate-400">
          Your progress will be saved automatically.
        </p>

        <div
          className="mb-6 mt-4 rounded-xl p-4"
          style={{ backgroundColor: '#0F0F1A' }}
        >
          <ExitProgressRow
            label="Questions answered"
            value={`${answeredCount} of ${totalCount}`}
          />
          <ExitProgressRow
            label="Correct so far"
            value={String(correctCount)}
            valueClass="text-emerald-400 font-semibold"
          />
          <ExitProgressRow
            label="Resuming will continue from"
            value={`Question ${currentIndex + 1}`}
            valueClass="text-purple-400 font-semibold"
            last
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSaveAndExit}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: '#DC2626' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = '#B91C1C')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = '#DC2626')
            }
          >
            Save &amp; Exit
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: '#9333EA' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = '#7E22CE')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = '#9333EA')
            }
          >
            Continue Challenge
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ExitProgressRow({
  label,
  value,
  valueClass,
  last,
}: {
  label: string;
  value: string;
  valueClass?: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2 text-sm text-slate-400"
      style={
        last
          ? undefined
          : { borderBottom: '1px solid rgba(255,255,255,0.05)' }
      }
    >
      <span>{label}</span>
      <span className={valueClass ?? 'text-white font-semibold'}>{value}</span>
    </div>
  );
}

function ViolationWarning({
  violations,
  onDismiss,
}: {
  violations: number;
  onDismiss: () => void;
}) {
  const remaining = Math.max(0, 3 - violations);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl mx-4"
        style={{
          backgroundColor: '#161B26',
          border: '1px solid rgba(239,68,68,0.4)',
          boxShadow: '0 30px 80px -20px rgba(239,68,68,0.35)',
        }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <ShieldAlert className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="mb-2 text-center text-xl font-bold text-white">
          Focus mode interrupted
        </h2>
        <p className="mb-2 text-center text-sm text-slate-400">
          You left the focused challenge view. To keep the session
          honest, this counts as a violation.
        </p>
        <div
          className="my-4 rounded-xl p-4 text-center"
          style={{ backgroundColor: '#0F0F1A' }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Violations
          </p>
          <p className="mt-1 text-2xl font-semibold text-red-400">
            {violations} / 3
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {remaining === 0
              ? 'Session will end now.'
              : `${remaining} more will end the session automatically.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
          style={{ backgroundColor: '#9333EA' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = '#7E22CE')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = '#9333EA')
          }
        >
          Resume in focus mode
        </button>
      </motion.div>
    </div>
  );
}

function stripPrefix(raw: string): string {
  return raw.replace(/^\s*(CORRECT|WRONG)\s*[—:-]\s*/i, '').trim();
}

function whyDistractorIsWrong(question: HistologyQuestion, choiceId: string): string {
  const choice = question.choices.find((c) => c.id === choiceId);
  if (!choice) return '';

  const sentences = question.explanation
    .split(/(?<=[.])\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const stopwords = new Set([
    'where',
    'their',
    'which',
    'these',
    'those',
    'between',
    'against',
    'while',
    'shows',
    'using',
  ]);
  const distinctive =
    choice.text
      .toLowerCase()
      .match(/[a-z]{6,}/g)
      ?.filter((w) => !stopwords.has(w))
      ?.slice(0, 4) ?? [];

  for (const word of distinctive) {
    const match = sentences.find((s) => s.toLowerCase().includes(word));
    if (match && match.length < 220) return match;
  }

  return `Common distractor for ${question.topic.toLowerCase()} — see Explanation for the discriminating mechanism.`;
}
