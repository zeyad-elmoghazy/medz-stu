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
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  LogOutIcon,
  SpinnerIcon,
  StickyNoteIcon,
  ZoomInIcon,
} from '@/components/icons';
import { ImageZoomViewer } from '@/components/quiz/ImageZoomViewer';
import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import {
  fetchChapterQuiz,
  fetchChapterReferenceImage,
  fetchBookmarkStatus,
  addBookmark,
  removeBookmark,
  fetchNote,
  saveNote,
  submitChapterQuiz,
  type ChapterQuiz,
  type ChapterQuizQuestion,
} from '@/lib/chapter-quiz-api';
import { cn, letterFor } from '@/lib/utils';

/**
 * Chapter-scoped quiz — same UI/UX as the working custom-exam quiz
 * engine (app/(student)/student/quiz/[subjectId]/page.tsx), minus
 * the AI-tutor panel (not available for this surface). That file is
 * read-only reference here, never imported: its internal
 * sub-components (PhaseOne, TopBar, StructuredExplanation,
 * ReferenceCard, ExitConfirmationModal, ...) aren't exported, so
 * this page re-implements them, adapted for DB-backed chapter
 * questions instead of the static histology bank. Anti-cheat is
 * deliberately lighter than the reference (fullscreen encouraged,
 * but no violation-counting / forced session end) — this remains an
 * untimed practice surface, not a proctored challenge.
 */

// Heavy panel is dynamic-imported so its JS isn't part of the
// initial quiz bundle — same reasoning as the reference page.
const RichTextEditor = dynamic(() => import('@/components/quiz/NotesEditor'), {
  loading: () => (
    <div
      className="fixed right-0 top-0 z-50 h-full w-full max-w-md p-5 text-sm text-text-muted"
      style={{ backgroundColor: 'var(--surface)', borderLeft: '1px solid var(--line)' }}
    >
      Loading editor...
    </div>
  ),
  ssr: false,
});

export default function ChapterQuizPage() {
  const router = useRouter();
  const params = useParams<{ chapterId: string }>();
  const chapterId = params.chapterId;

  const [data, setData] = useState<ChapterQuiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentQuestionIndex = useChapterQuizStore((s) => s.currentQuestionIndex);
  const answers = useChapterQuizStore((s) => s.answers);
  const filterQuestionIds = useChapterQuizStore((s) => s.filterQuestionIds);
  const sessionStartedAt = useChapterQuizStore((s) => s.sessionStartedAt);
  const answerQuestion = useChapterQuizStore((s) => s.answerQuestion);
  const nextQuestion = useChapterQuizStore((s) => s.nextQuestion);
  const completeSession = useChapterQuizStore((s) => s.completeSession);
  const setLastResult = useChapterQuizStore((s) => s.setLastResult);
  const recordMistakes = useChapterQuizStore((s) => s.recordMistakes);
  const clearMistakes = useChapterQuizStore((s) => s.clearMistakes);
  const saveSession = useChapterQuizStore((s) => s.saveSession);
  const clearSession = useChapterQuizStore((s) => s.clearSession);
  const jumpToQuestion = useChapterQuizStore((s) => s.jumpToQuestion);
  const startSession = useChapterQuizStore((s) => s.startSession);

  useEffect(() => {
    let cancelled = false;
    fetchChapterQuiz(chapterId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const questions = useMemo(() => {
    const allQuestions = data?.questions ?? [];
    if (filterQuestionIds && filterQuestionIds.length > 0) {
      const idSet = new Set(filterQuestionIds);
      return allQuestions.filter((q) => idSet.has(q.id));
    }
    return allQuestions;
  }, [data, filterQuestionIds]);

  const totalQuestions = Math.max(questions.length, 1);
  const safeIndex = Math.min(Math.max(currentQuestionIndex, 0), totalQuestions - 1);
  const currentQuestion = questions[safeIndex] ?? null;

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'explanation' | 'reference'>('explanation');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const intentionalExitRef = useRef(false);

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceImageLoading, setReferenceImageLoading] = useState(false);
  const referenceFetchedForRef = useRef<number | null>(null);

  const submittedRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    // If the store already has answers, the user is resuming a
    // saved session — show the toast and keep the state as-is.
    // Otherwise this is a fresh visit: wipe any stale saved session
    // and start the timer.
    const existingAnswers = useChapterQuizStore.getState().answers;
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
  }, [!!data]);

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

  useEffect(() => {
    if (!currentQuestion) return;
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
    setActiveTab('explanation');
    setReferenceImageUrl(null);
    setReferenceImageLoading(false);
    referenceFetchedForRef.current = null;
    // Intentionally scoped to the id, not the whole `currentQuestion`
    // object — a new array reference from `questions` shouldn't
    // re-run this on every render, only an actual question change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, answers]);

  useEffect(() => {
    if (!currentQuestion) return;
    let cancelled = false;
    fetchBookmarkStatus(currentQuestion.id).then((b) => {
      if (!cancelled) setBookmarked(b);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (!currentQuestion) return;
    let cancelled = false;
    fetchNote(currentQuestion.id).then((content) => {
      if (!cancelled) setNoteContent(content);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  async function toggleBookmark() {
    if (!currentQuestion || bookmarkLoading) return;
    setBookmarkLoading(true);
    const ok = bookmarked
      ? await removeBookmark(currentQuestion.id)
      : await addBookmark(currentQuestion.id);
    if (ok) setBookmarked((b) => !b);
    setBookmarkLoading(false);
  }

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
      // Browser requires a user gesture — the manual "Enter focus
      // mode" button covers this, same fallback as the reference page.
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

  useEffect(() => {
    if (!submitted && currentQuestion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      enterFullscreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, currentQuestion?.id, enterFullscreen]);

  // Lighter than the reference page's handler on purpose: tracks
  // fullscreen state for the UI, but never counts violations or
  // force-ends the session — this is an untimed practice quiz, not
  // a proctored challenge (see the file-level comment).
  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
      intentionalExitRef.current = false;
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function handleExitButtonClick() {
    if (submitting) return;
    intentionalExitRef.current = true;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setShowExitModal(true);
  }

  function handleSaveAndExit() {
    saveSession(chapterId);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      intentionalExitRef.current = true;
      document.exitFullscreen().catch(() => {});
    }
    setShowExitModal(false);
    router.push('/student/catalogue');
  }

  function handleContinueChallenge() {
    setShowExitModal(false);
    if (!submittedRef.current) enterFullscreen();
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

  const isCorrect = !!currentQuestion && submitted && selectedChoice === currentQuestion.correctAnswer;
  const isLastQuestion = safeIndex === totalQuestions - 1;
  const progressPct = Math.round(((safeIndex + (submitted ? 1 : 0)) / totalQuestions) * 100);

  function handleSubmit() {
    if (!selectedChoice || submitted || !currentQuestion) return;
    submittedRef.current = true;
    answerQuestion(currentQuestion.id, selectedChoice);
    setSubmitted(true);
    exitFullscreen();

    if (
      currentQuestion.referencePage != null &&
      referenceFetchedForRef.current !== currentQuestion.id
    ) {
      referenceFetchedForRef.current = currentQuestion.id;
      setReferenceImageLoading(true);
      fetchChapterReferenceImage(chapterId, currentQuestion.referencePage)
        .then(setReferenceImageUrl)
        .finally(() => setReferenceImageLoading(false));
    }
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
   * Finalize the quiz: POSTs to the chapter submit endpoint (real
   * XP-earning persistence, via lib/chapter-quiz-api.ts's
   * submitChapterQuiz — see app/api/student/chapters/[chapterId]/
   * submit/route.ts for why this earns XP/leaderboard credit rather
   * than writing a session-history row), then stashes the
   * per-question result in the store for the results page and
   * routes. Errors set `submitError` so the student can retry
   * without losing their answers — same pattern as the reference page.
   */
  async function handleQuizComplete() {
    if (submitting || !data) return;
    setSubmitError(null);

    const stringKeyedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      stringKeyedAnswers[String(k)] = v;
    }

    setSubmitting(true);
    try {
      const resultData = await submitChapterQuiz(
        chapterId,
        stringKeyedAnswers,
        questions.map((q) => q.id)
      );

      setLastResult(resultData);
      const wrongIds = resultData.results
        .filter((r) => r.chosen !== null && !r.isCorrect)
        .map((r) => r.questionId);
      const correctIds = resultData.results.filter((r) => r.isCorrect).map((r) => r.questionId);
      recordMistakes(chapterId, wrongIds);
      clearMistakes(chapterId, correctIds);
      completeSession();
      clearSession();
      router.push(`/student/results/chapter/${chapterId}`);
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
    if (!currentQuestion) return;
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

  if (loadError) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <p className="text-sm text-error">{loadError}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center gap-2 text-sm text-text-muted"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <SpinnerIcon size={16} className="animate-spin" />
        Loading quiz…
      </main>
    );
  }

  if (data.questions.length === 0) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <p className="text-sm text-text-muted">No published questions in this chapter yet.</p>
      </main>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <main className="relative min-h-screen w-full" style={{ backgroundColor: 'var(--bg)' }}>
      <TopBar
        currentIndex={safeIndex}
        total={totalQuestions}
        progressPct={progressPct}
        isBookmarked={bookmarked}
        bookmarkLoading={bookmarkLoading}
        onBookmarkToggle={toggleBookmark}
        onNotesOpen={() => setShowNotesPanel(true)}
        showFullscreenButton={!isFullscreen && fullscreenSupported && !submitted}
        onRequestFullscreen={enterFullscreen}
        chapterName={data.chapterName}
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
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-accent"
              style={{
                backgroundColor: 'rgb(var(--accent-text-rgb) / 0.2)',
                border: '1px solid rgb(var(--accent-text-rgb) / 0.3)',
              }}
            >
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
              backgroundColor: 'rgb(var(--error-rgb) / 0.08)',
              border: '1px solid rgb(var(--error-rgb) / 0.35)',
              color: 'var(--error)',
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
                backgroundColor: 'var(--error)',
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
                isBookmarked={bookmarked}
                onBookmarkToggle={toggleBookmark}
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
                referenceImageUrl={referenceImageUrl}
                referenceImageLoading={referenceImageLoading}
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
              key={currentQuestion.id}
              topic={currentQuestion.topic}
              initialValue={noteContent}
              onChange={(value) => saveNote(currentQuestion.id, value)}
              onClose={() => setShowNotesPanel(false)}
            />
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
    </main>
  );
}

function TopBar({
  currentIndex,
  total,
  progressPct,
  isBookmarked,
  bookmarkLoading,
  onBookmarkToggle,
  onNotesOpen,
  showFullscreenButton,
  onRequestFullscreen,
  chapterName,
  onExit,
}: {
  currentIndex: number;
  total: number;
  progressPct: number;
  isBookmarked: boolean;
  bookmarkLoading: boolean;
  onBookmarkToggle: () => void;
  onNotesOpen: () => void;
  showFullscreenButton: boolean;
  onRequestFullscreen: () => void;
  chapterName: string;
  onExit: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-4">
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Active chapter
          </span>
          <span className="text-sm font-semibold text-text-primary">{chapterName}</span>
        </div>

        <div className="flex flex-1 items-center gap-4">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-input">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'var(--accent-text)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-text-muted">
            Question <span className="text-text-primary">{currentIndex + 1}</span> of {total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {showFullscreenButton && (
            <IconButton
              label="Enter focus mode"
              onClick={onRequestFullscreen}
              icon={<ExpandIcon size={16} />}
            />
          )}
          <button
            type="button"
            onClick={onExit}
            title="Exit the quiz"
            className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-text-muted transition-all duration-200 hover:border-error/30 hover:bg-error/10 hover:text-error"
          >
            <LogOutIcon size={14} />
            Exit
          </button>
          <span
            aria-hidden
            className="mx-1 h-5 w-px"
            style={{ backgroundColor: 'var(--line)' }}
          />
          <IconButton
            label={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
            onClick={onBookmarkToggle}
            active={isBookmarked}
            disabled={bookmarkLoading}
            icon={
              bookmarkLoading ? (
                <SpinnerIcon size={16} className="animate-spin" />
              ) : (
                <BookmarkIcon size={16} filled={isBookmarked} />
              )
            }
          />
          <IconButton
            label="Open notes"
            onClick={onNotesOpen}
            icon={<StickyNoteIcon size={16} />}
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
  disabled,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-lg transition disabled:cursor-default',
        active ? 'text-accent' : 'text-text-muted hover:text-text-primary'
      )}
      style={{
        border: '1px solid var(--line)',
        backgroundColor: active ? 'rgb(var(--accent-text-rgb) / 0.18)' : 'var(--surface)',
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
  question: ChapterQuizQuestion;
  selectedChoice: string | null;
  setSelectedChoice: Dispatch<SetStateAction<string | null>>;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"
          style={{
            backgroundColor: 'rgb(var(--accent-text-rgb) / 0.18)',
            border: '1px solid rgb(var(--accent-text-rgb) / 0.4)',
          }}
        >
          {question.topic}
        </span>
      </div>

      <h1 className="text-2xl font-semibold leading-relaxed text-text-primary md:text-[28px] md:leading-snug">
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
                backgroundColor: isSelected ? 'rgb(var(--accent-text-rgb) / 0.12)' : 'var(--surface)',
                border: `1px solid ${isSelected ? 'var(--accent-text)' : 'var(--line)'}`,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--accent-text)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-semibold transition',
                  isSelected ? 'bg-accent text-white' : 'bg-input text-text-muted'
                )}
              >
                {letterFor(idx)}
              </span>
              <span className="pt-1 text-sm leading-relaxed text-text-primary md:text-base">
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
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: 'var(--accent-text)',
        }}
      >
        Submit Answer
        <ArrowRightIcon size={16} />
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
  question: ChapterQuizQuestion;
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
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <ResultBadge isCorrect={isCorrect} />

      <h2 className="text-xl font-semibold leading-relaxed text-text-primary md:text-2xl md:leading-snug">
        {question.question}
      </h2>

      <div className="space-y-3">
        {question.choices.map((choice, idx) => {
          const isCorrectChoice = choice.id === question.correctAnswer;
          const isUserChoice = selectedChoice === choice.id;
          const isWrongUserChoice = isUserChoice && !isCorrectChoice;

          let bg = 'var(--bg)';
          let border = 'var(--line)';
          let badgeBg = 'var(--fill)';
          let badgeText = 'text-text-muted';
          let icon: React.ReactNode = letterFor(idx);

          if (isCorrectChoice) {
            bg = 'rgb(var(--success-rgb) / 0.08)';
            border = 'var(--success)';
            badgeBg = 'var(--success)';
            badgeText = 'text-white';
            icon = <CheckIcon size={16} />;
          } else if (isWrongUserChoice) {
            bg = 'rgb(var(--error-rgb) / 0.08)';
            border = 'var(--error)';
            badgeBg = 'var(--error)';
            badgeText = 'text-white';
            icon = <CloseIcon size={16} />;
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
                        ? 'text-success'
                        : isWrongUserChoice
                          ? 'text-error'
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

      <div
        className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-5"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton
            label={isBookmarked ? 'Bookmarked' : 'Bookmark'}
            onClick={onBookmarkToggle}
            active={isBookmarked}
            icon={<BookmarkIcon size={14} filled={isBookmarked} />}
          />
          <ToolbarButton
            label="Notes"
            onClick={onNotesOpen}
            icon={<StickyNoteIcon size={14} />}
          />
          <ToolbarButton
            label={copied ? 'Copied!' : 'Copy'}
            onClick={onCopy}
            icon={
              copied ? (
                <CheckIcon size={14} className="text-success" />
              ) : (
                <CopyIcon size={14} />
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
            backgroundColor: 'var(--accent-text)',
          }}
        >
          {submitting ? (
            <>
              <SpinnerIcon size={16} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              {isLastQuestion ? 'See Results' : 'Next Question'}
              <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
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
              backgroundColor: 'rgb(var(--success-rgb) / 0.15)',
              color: 'var(--success)',
              border: '1px solid rgb(var(--success-rgb) / 0.45)',
            }
          : {
              backgroundColor: 'rgb(var(--error-rgb) / 0.15)',
              color: 'var(--error)',
              border: '1px solid rgb(var(--error-rgb) / 0.45)',
            }
      }
    >
      {isCorrect ? (
        <>
          <CheckIcon size={14} /> Correct
        </>
      ) : (
        <>
          <CloseIcon size={14} /> Incorrect
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
        active ? 'text-accent' : 'text-text-muted hover:text-text-primary'
      )}
      style={{
        border: '1px solid var(--line)',
        backgroundColor: active ? 'rgb(var(--accent-text-rgb) / 0.15)' : 'var(--bg)',
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
  referenceImageUrl,
  referenceImageLoading,
}: {
  question: ChapterQuizQuestion;
  activeTab: 'explanation' | 'reference';
  setActiveTab: Dispatch<SetStateAction<'explanation' | 'reference'>>;
  referenceImageUrl: string | null;
  referenceImageLoading: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col rounded-2xl"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-1 p-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <TabButton
          active={activeTab === 'explanation'}
          onClick={() => setActiveTab('explanation')}
          label="Explanation"
        />
        <TabButton
          active={activeTab === 'reference'}
          onClick={() => setActiveTab('reference')}
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
              {referenceImageLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <SpinnerIcon size={14} className="animate-spin" />
                  Loading reference image…
                </div>
              ) : (
                <ReferenceCard reference={question.reference} imageUrl={referenceImageUrl} />
              )}
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
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-[0.16em] transition',
        active ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
      )}
      style={{
        backgroundColor: active ? 'rgb(var(--accent-text-rgb) / 0.18)' : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function StructuredExplanation({ question }: { question: ChapterQuizQuestion }) {
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
  const correctChoice = question.choices.find((c) => c.id === question.correctAnswer);

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader>Key concept</SectionHeader>
        <p className="mt-2.5 text-sm leading-relaxed text-text-primary">{summary}</p>
      </section>

      {details.length > 0 && (
        <section>
          <SectionHeader>Why this answer</SectionHeader>
          <ul className="mt-2.5 space-y-2.5">
            {details.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-primary">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {question.choiceRationales && (
        <section>
          <SectionHeader>Choice-by-choice</SectionHeader>
          <ul className="mt-2.5 space-y-2">
            {question.choices.map((c) => {
              const raw = question.choiceRationales?.[c.id];
              if (!raw) return null;
              const isCorrectChoice = c.id === question.correctAnswer;
              return (
                <li
                  key={c.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: isCorrectChoice
                      ? 'rgb(var(--success-rgb) / 0.08)'
                      : 'var(--fill)',
                    border: `1px solid ${isCorrectChoice ? 'rgb(var(--success-rgb) / 0.35)' : 'var(--line)'}`,
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: isCorrectChoice ? 'var(--success)' : 'var(--error)' }}
                  >
                    {c.id.toUpperCase()} · {isCorrectChoice ? 'Correct' : 'Wrong'}
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
        <SectionHeader>Take-away</SectionHeader>
        <div
          className="mt-2.5 rounded-xl p-4"
          style={{
            backgroundColor: 'rgb(var(--accent-text-rgb) / 0.08)',
            border: '1px solid rgb(var(--accent-text-rgb) / 0.25)',
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-accent">
            Topic · {question.topic}
          </p>
          {correctChoice && (
            <p className="mt-2 text-sm leading-relaxed text-text-primary">
              <span className="font-semibold text-accent">Correct answer:</span>{' '}
              {correctChoice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
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
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const closeZoom = useCallback(() => setZoomOpen(false), []);

  return (
    <div
      className="relative overflow-hidden rounded-xl p-6"
      style={{
        backgroundColor: 'var(--reference-bg)',
        color: 'var(--reference-text)',
        border: '1px solid var(--reference-border)',
      }}
    >
      <div
        className="flex items-center gap-2 pb-4"
        style={{ borderBottom: '1px dashed var(--reference-border)' }}
      >
        <div className="flex flex-col leading-tight">
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--reference-accent)' }}
          >
            Reference
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--reference-accent)' }}>
            From the Module Reference Book
          </span>
        </div>
      </div>

      {imageUrl && (
        <>
          <button
            ref={zoomTriggerRef}
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Open reference page full screen to zoom"
            data-testid="reference-zoom-trigger"
            className="group relative mt-5 block w-full overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              border: '1px solid var(--reference-border)',
              backgroundColor: 'var(--reference-bg)',
              cursor: 'zoom-in',
              outlineColor: 'var(--reference-accent)',
            }}
          >
            {/* Plain <img> — bucket URLs aren't in next/image's remotePatterns. */}
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
            <span
              className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--text2)',
                border: '1px solid var(--line)',
              }}
            >
              <ZoomInIcon size={14} />
              Tap to zoom
            </span>
          </button>
          <ImageZoomViewer
            open={zoomOpen}
            src={imageUrl}
            alt="Source page from the module reference book, enlarged"
            onClose={closeZoom}
            returnFocusRef={zoomTriggerRef}
          />
        </>
      )}

      <p className="mt-5 font-handwritten leading-relaxed" style={{ fontSize: '1.4rem', color: 'var(--reference-text)' }}>
        {reference}
      </p>

      <p className="mt-6 text-right text-xs italic" style={{ color: 'var(--reference-accent)' }}>
        Module Reference Book
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
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
          <LogOutIcon size={24} className="text-error" />
        </div>

        <h2 id="exit-confirmation-title" className="mb-2 text-center text-xl font-bold text-text-primary">
          Exit Quiz?
        </h2>
        <p className="mb-2 text-center text-sm text-text-muted">
          Your progress will be saved automatically.
        </p>

        <div className="mb-6 mt-4 rounded-xl p-4" style={{ backgroundColor: 'var(--fill)' }}>
          <ExitProgressRow label="Questions answered" value={`${answeredCount} of ${totalCount}`} />
          <ExitProgressRow
            label="Correct so far"
            value={String(correctCount)}
            valueClass="text-success font-semibold"
          />
          <ExitProgressRow
            label="Resuming will continue from"
            value={`Question ${currentIndex + 1}`}
            valueClass="text-accent font-semibold"
            last
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSaveAndExit}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: 'var(--error)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--error)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--error)')}
          >
            Save &amp; Exit
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: 'var(--accent-text)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-text)')}
          >
            Continue Quiz
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
      className="flex items-center justify-between py-2 text-sm text-text-muted"
      style={last ? undefined : { borderBottom: '1px solid var(--line)' }}
    >
      <span>{label}</span>
      <span className={valueClass ?? 'text-text-primary font-semibold'}>{value}</span>
    </div>
  );
}

function stripPrefix(raw: string): string {
  return raw.replace(/^\s*(CORRECT|WRONG)\s*[—:-]\s*/i, '').trim();
}

function whyDistractorIsWrong(question: ChapterQuizQuestion, choiceId: string): string {
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

  return `Common distractor for ${question.topic.toLowerCase()}; see Explanation for the discriminating mechanism.`;
}
