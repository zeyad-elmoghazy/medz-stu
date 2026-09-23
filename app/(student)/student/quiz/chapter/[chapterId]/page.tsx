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
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
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
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';
import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import {
  fetchChapterQuiz,
  fetchChapterReferenceImage,
  fetchBookmarkStatus,
  addBookmark,
  removeBookmark,
  fetchNote,
  saveNote,
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
      style={{ backgroundColor: '#132B45', borderLeft: '1px solid #132B45' }}
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
   * Finalize the quiz: always POSTs to the chapter submit endpoint
   * (real DB persistence — see 025_chapter_quiz_sessions.sql), then
   * stashes the per-question result in the store for the results
   * page and routes. Errors set `submitError` so the student can
   * retry without losing their answers — same pattern as the
   * reference page.
   */
  async function handleQuizComplete() {
    if (submitting || !data) return;
    setSubmitError(null);

    const startedAt = new Date(sessionStartedAt ?? Date.now()).toISOString();
    const stringKeyedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      stringKeyedAnswers[String(k)] = v;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/student/chapters/${chapterId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          answers: stringKeyedAnswers,
          questionIds: questions.map((q) => q.id),
          startedAt,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Submission failed (${res.status})`);
      }

      const resultData = (await res.json()) as {
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
        style={{ backgroundColor: '#0B1F33' }}
      >
        <p className="text-sm text-rose-300">{loadError}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center gap-2 text-sm text-text-muted"
        style={{ backgroundColor: '#0B1F33' }}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading quiz…
      </main>
    );
  }

  if (data.questions.length === 0) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center px-6 text-center"
        style={{ backgroundColor: '#0B1F33' }}
      >
        <p className="text-sm text-text-muted">No published questions in this chapter yet.</p>
      </main>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <main className="relative min-h-screen w-full" style={{ backgroundColor: '#0B1F33' }}>
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
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-[#33BFBF]"
              style={{
                backgroundColor: 'rgba(0,166,166,0.2)',
                border: '1px solid rgba(0,166,166,0.3)',
                boxShadow: '0 0 18px rgba(0,166,166,0.25)',
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
        backgroundColor: 'rgba(9, 9, 14, 0.88)',
        borderBottom: '1px solid #132B45',
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-4">
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Active chapter
          </span>
          <span className="text-sm font-semibold text-white">{chapterName}</span>
        </div>

        <div className="flex flex-1 items-center gap-4">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #00A6A6 0%, #33BFBF 100%)',
                boxShadow: '0 0 16px rgba(0,166,166,0.55)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-text-muted">
            Question <span className="text-white">{currentIndex + 1}</span> of {total}
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
            title="Exit the quiz"
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
            disabled={bookmarkLoading}
            icon={
              bookmarkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isBookmarked ? (
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
        active ? 'text-[#33BFBF]' : 'text-text-muted hover:text-white'
      )}
      style={{
        border: '1px solid #132B45',
        backgroundColor: active ? 'rgba(0,166,166,0.18)' : '#132B45',
        boxShadow: active ? '0 0 14px rgba(0,166,166,0.35)' : undefined,
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
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#33BFBF]"
          style={{
            backgroundColor: 'rgba(0,166,166, 0.18)',
            border: '1px solid rgba(51,191,191, 0.4)',
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
                backgroundColor: isSelected ? 'rgba(0,166,166, 0.12)' : '#132B45',
                border: `1px solid ${isSelected ? '#00A6A6' : '#132B45'}`,
                boxShadow: isSelected ? '0 0 24px rgba(0,166,166,0.35)' : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = '#00A6A6';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = '#132B45';
              }}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-semibold transition',
                  isSelected ? 'bg-[#00A6A6] text-white' : 'bg-white/5 text-text-muted'
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
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: '#00A6A6',
          boxShadow: selectedChoice ? '0 0 28px rgba(0,166,166,0.55)' : 'none',
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
      style={{ backgroundColor: '#132B45', border: '1px solid #132B45' }}
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

          let bg = '#0B1F33';
          let border = '#132B45';
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

      <div
        className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-5"
        style={{ borderColor: '#132B45' }}
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
            backgroundColor: '#00A6A6',
            boxShadow: '0 0 24px rgba(0,166,166,0.45)',
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
        active ? 'text-[#33BFBF]' : 'text-text-muted hover:text-white'
      )}
      style={{
        border: '1px solid #132B45',
        backgroundColor: active ? 'rgba(0,166,166,0.15)' : '#0B1F33',
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
      style={{ backgroundColor: '#132B45', border: '1px solid #132B45' }}
    >
      <div className="flex items-center gap-1 p-2" style={{ borderBottom: '1px solid #132B45' }}>
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
              {referenceImageLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
        backgroundColor: active ? 'rgba(0,166,166,0.18)' : 'transparent',
        boxShadow: active ? '0 0 14px rgba(0,166,166,0.3)' : 'none',
      }}
    >
      {icon}
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
        <SectionHeader icon={<Lightbulb className="h-3.5 w-3.5" />}>Key concept</SectionHeader>
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
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#33BFBF]" />
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
              const isCorrectChoice = c.id === question.correctAnswer;
              return (
                <li
                  key={c.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: isCorrectChoice
                      ? 'rgba(16,185,129,0.08)'
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isCorrectChoice ? 'rgba(16,185,129,0.35)' : '#132B45'}`,
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: isCorrectChoice ? '#6EE7B7' : '#FCA5A5' }}
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
        <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />}>Take-away</SectionHeader>
        <div
          className="mt-2.5 rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(0,166,166, 0.08)',
            border: '1px solid rgba(51,191,191, 0.25)',
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#33BFBF]">
            Topic · {question.topic}
          </p>
          {correctChoice && (
            <p className="mt-2 text-sm leading-relaxed text-white">
              <span className="font-semibold text-[#33BFBF]">Correct answer:</span>{' '}
              {correctChoice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#33BFBF]">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-[#33BFBF]/15 text-[#33BFBF]">
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
          style={{ backgroundColor: 'rgba(230, 217, 168, 0.12)', color: '#E6D9A8' }}
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
          <span className="text-sm font-semibold" style={{ color: '#E6D9A8' }}>
            From the Module Reference Book
          </span>
        </div>
      </div>

      {imageUrl && (
        <div
          className="mt-5 overflow-hidden rounded-lg"
          style={{ border: '1px solid rgba(230, 217, 168, 0.25)', backgroundColor: '#FAFAF5' }}
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
        </div>
      )}

      <p className="mt-5 font-handwritten leading-relaxed" style={{ fontSize: '1.4rem', color: '#FAFAF5' }}>
        {reference}
      </p>

      <p className="mt-6 text-right text-xs italic" style={{ color: 'rgba(230, 217, 168, 0.65)' }}>
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
        style={{ backgroundColor: '#132B45', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <LogOut className="h-6 w-6 text-red-400" />
        </div>

        <h2 id="exit-confirmation-title" className="mb-2 text-center text-xl font-bold text-white">
          Exit Quiz?
        </h2>
        <p className="mb-2 text-center text-sm text-slate-400">
          Your progress will be saved automatically.
        </p>

        <div className="mb-6 mt-4 rounded-xl p-4" style={{ backgroundColor: '#132B45' }}>
          <ExitProgressRow label="Questions answered" value={`${answeredCount} of ${totalCount}`} />
          <ExitProgressRow
            label="Correct so far"
            value={String(correctCount)}
            valueClass="text-emerald-400 font-semibold"
          />
          <ExitProgressRow
            label="Resuming will continue from"
            value={`Question ${currentIndex + 1}`}
            valueClass="text-[#33BFBF] font-semibold"
            last
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSaveAndExit}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: '#DC2626' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B91C1C')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          >
            Save &amp; Exit
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{ backgroundColor: '#33BFBF' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#33BFBF')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#33BFBF')}
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
      className="flex items-center justify-between py-2 text-sm text-slate-400"
      style={last ? undefined : { borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span>{label}</span>
      <span className={valueClass ?? 'text-white font-semibold'}>{value}</span>
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

  return `Common distractor for ${question.topic.toLowerCase()} — see Explanation for the discriminating mechanism.`;
}
