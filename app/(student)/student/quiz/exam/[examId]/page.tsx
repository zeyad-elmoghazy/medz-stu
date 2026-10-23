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
  FlagIcon,
  LogOutIcon,
  SpinnerIcon,
  StickyNoteIcon,
  ZoomInIcon,
} from '@/components/icons';
import { ImageZoomViewer } from '@/components/quiz/ImageZoomViewer';
import { isTouchDevice } from '@/lib/is-touch-device';
import { useCustomExamStore } from '@/lib/custom-exam-store';
import {
  fetchChapterReferenceImage,
  fetchBookmarkStatus,
  addBookmark,
  removeBookmark,
  fetchFlagStatus,
  reportQuestion,
  fetchNote,
  saveNote,
  type ChapterQuizQuestion,
} from '@/lib/chapter-quiz-api';
import {
  CustomExamApiError,
  fetchCustomExam,
  saveCustomExamProgress,
  submitCustomExam,
  type CustomExam,
} from '@/lib/custom-exam-api';
import { moduleLabel } from '@/lib/dashboard-data';
import { cn, letterFor } from '@/lib/utils';
import {
  FLAG_DETAIL_MAX,
  FLAG_REASONS,
  FLAG_REASON_LABELS,
  type FlagReason,
} from '@/lib/question-flags';

/**
 * Custom Exam quiz — an exact clone of the chapter quiz
 * (app/(student)/student/quiz/chapter/[chapterId]/page.tsx): the same
 * two-phase UI, explanation / reference panels, bookmark, notes,
 * report, fullscreen focus mode and touch behaviour. Only the data
 * layer differs: the questions are a fixed mixed set drawn from several
 * chapters when the exam was created, and the server
 * (custom_exam_progress, migration 035) is the source of truth for the
 * answers so far — so there is no "fresh start" handshake and nothing
 * about the attempt is kept in the browser. The chapter page itself is
 * deliberately left untouched. Like it, this stays an untimed practice
 * surface: fullscreen is encouraged, never enforced, and there is no
 * violation counting.
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

export default function CustomExamQuizPage() {
  const router = useRouter();
  const params = useParams<{ examId: string }>();
  const examId = params.examId;

  const [data, setData] = useState<CustomExam | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentQuestionIndex = useCustomExamStore((s) => s.currentQuestionIndex);
  const answers = useCustomExamStore((s) => s.answers);
  const answerQuestion = useCustomExamStore((s) => s.answerQuestion);
  const nextQuestion = useCustomExamStore((s) => s.nextQuestion);
  const completeSession = useCustomExamStore((s) => s.completeSession);
  const setLastResult = useCustomExamStore((s) => s.setLastResult);
  const hydrateFromServer = useCustomExamStore((s) => s.hydrateFromServer);
  const clearSession = useCustomExamStore((s) => s.clearSession);
  const jumpToQuestion = useCustomExamStore((s) => s.jumpToQuestion);

  const questions = useMemo(() => data?.questions ?? [], [data]);

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
  // False until the saved-attempt check below has settled, so the
  // student can't answer a question that is about to be replaced by
  // the restored state.
  const [progressChecked, setProgressChecked] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  // Tail of the queue of progress saves. Saves run one after another
  // so a slow earlier request can never land after a later one, and
  // Save & Exit / submit can wait for everything in flight.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const intentionalExitRef = useRef(false);

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  // "Report this question to the admins" — ids of the questions THIS
  // student already has a question_flags row for. Keyed by question id
  // (rather than a single boolean) so moving to the next question can
  // never show the previous one's "Reported" state. The modal keeps its
  // own form state.
  const [reportedIds, setReportedIds] = useState<ReadonlySet<number>>(() => new Set());
  const reported = currentQuestion ? reportedIds.has(currentQuestion.id) : false;
  const [showReportModal, setShowReportModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceImageLoading, setReferenceImageLoading] = useState(false);

  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // The server (custom_exam_progress) is the source of truth: the exam's
    // questions are fixed when it is created, and the answers so far and
    // the position come back with them. Whether this is a brand-new exam,
    // a Continue, a reload or another device, the page always starts from
    // exactly this — never from leftover browser state. Hydrating the
    // store BEFORE `data` is set means the first render with questions
    // already has the restored answers.
    async function init() {
      try {
        const exam = await fetchCustomExam(examId);
        if (cancelled) return;
        hydrateFromServer(exam.examId, exam.progress);
        setData(exam);
        if (Object.keys(exam.progress.answers).length > 0) setIsResuming(true);
        setProgressChecked(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof CustomExamApiError && err.status === 404) {
          setLoadError(
            'This exam is no longer available — it may already have been submitted or discarded. You can start a new one from Custom Exam.'
          );
        } else {
          setLoadError(
            err instanceof Error
              ? `Couldn't load your exam: ${err.message}. Check your connection and refresh to try again.`
              : "Couldn't load your exam. Check your connection and refresh to try again."
          );
        }
      }
    }
    void init();

    return () => {
      cancelled = true;
    };
  }, [examId, hydrateFromServer]);

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
    // Intentionally scoped to the id, not the whole `currentQuestion`
    // object — a new array reference from `questions` shouldn't
    // re-run this on every render, only an actual question change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, answers]);

  // Fetch the source-page image whenever the current question is
  // answered. Keyed on the persisted answer (not the transient
  // `submitted` flag) so it also runs when a question is already
  // answered on arrival — a resumed session, a page refresh, or
  // stepping back to an earlier question — not only inside
  // handleSubmit. Declared after the reset effect above so that, on
  // the commit where an answer lands, the reset runs first and the
  // fetch starts from a clean slate.
  const currentIsAnswered = !!currentQuestion && answers[currentQuestion.id] != null;
  const currentReferencePage = currentQuestion?.referencePage ?? null;
  // An exam spans chapters, so the page image is resolved through the
  // chapter THIS question belongs to (the route checks the question is
  // published there and cites that page).
  const currentChapterId = currentQuestion?.chapterId ?? null;
  useEffect(() => {
    if (!currentIsAnswered || currentReferencePage == null || currentChapterId == null) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReferenceImageLoading(true);
    fetchChapterReferenceImage(currentChapterId, currentReferencePage)
      .then((url) => {
        if (!cancelled) setReferenceImageUrl(url);
      })
      .finally(() => {
        if (!cancelled) setReferenceImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentChapterId, currentQuestion?.id, currentIsAnswered, currentReferencePage]);

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
    const questionId = currentQuestion.id;
    fetchFlagStatus(questionId).then((flagged) => {
      if (!cancelled && flagged) setReportedIds((prev) => new Set(prev).add(questionId));
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
    // Phones/tablets don't get fullscreen forced on every question (it
    // flickers on Android); the "Enter focus mode" button is still there.
    if (!submitted && currentQuestion && !isTouchDevice()) {
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

  /**
   * Saves the attempt (every answer so far + where the student is) to
   * the server, queued behind any save already in flight. Resolves to
   * whether the server confirmed THIS save — the queue is serial, so a
   * confirmed save also means every earlier one has landed.
   */
  function persistProgress(
    answersToSave: Record<number, string>,
    index: number
  ): Promise<boolean> {
    const stringKeyed: Record<string, string> = {};
    for (const [k, v] of Object.entries(answersToSave)) {
      stringKeyed[String(k)] = v;
    }
    const run = saveQueueRef.current.then(() =>
      saveCustomExamProgress(examId, {
        answers: stringKeyed,
        currentQuestionIndex: index,
      })
    );
    saveQueueRef.current = run;
    return run;
  }

  async function handleSaveAndExit() {
    if (savingExit) return;
    setExitError(null);
    setSavingExit(true);

    // Leave only once the server has confirmed the save. On failure
    // stay put, keep the answers, and say so — never claim "saved"
    // when it wasn't.
    const saved = await persistProgress(answers, safeIndex);
    if (!saved) {
      setSavingExit(false);
      setExitError(
        "We couldn't save your progress. Check your connection and try again — your answers are still here."
      );
      return;
    }

    if (typeof document !== 'undefined' && document.fullscreenElement) {
      intentionalExitRef.current = true;
      document.exitFullscreen().catch(() => {});
    }
    setShowExitModal(false);
    // Back to the builder, which offers Continue for the saved exam.
    router.push('/student/exam');
  }

  function handleContinueChallenge() {
    if (savingExit) return;
    setExitError(null);
    setShowExitModal(false);
    if (!submittedRef.current && !isTouchDevice()) enterFullscreen();
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
      if (e.key === 'Escape' && showReportModal) {
        setShowReportModal(false);
      } else if (e.key === 'Escape' && showNotesPanel) {
        setShowNotesPanel(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNotesPanel, showReportModal]);

  // Sends the report. Throws on failure so the modal can show the
  // message inline; 'already_reported' counts as success — the admins
  // already have this student's report.
  async function handleReportSubmit(reason: FlagReason, detail: string) {
    if (!currentQuestion) return;
    const questionId = currentQuestion.id;
    await reportQuestion(questionId, {
      reason,
      detail: detail.trim() || undefined,
    });
    setReportedIds((prev) => new Set(prev).add(questionId));
  }

  const isCorrect = !!currentQuestion && submitted && selectedChoice === currentQuestion.correctAnswer;
  const isLastQuestion = safeIndex === totalQuestions - 1;
  const progressPct = Math.round(((safeIndex + (submitted ? 1 : 0)) / totalQuestions) * 100);

  function handleSubmit() {
    if (!selectedChoice || submitted || !currentQuestion) return;
    submittedRef.current = true;
    answerQuestion(currentQuestion.id, selectedChoice);
    setSubmitted(true);
    exitFullscreen();
    // Record this answer on the server right away, so it counts toward
    // the Progress dashboard and survives a closed tab even if the
    // student never reaches Save & Exit. Fire-and-forget: a failure
    // here is retried by the next answer's full snapshot and, finally,
    // by Save & Exit, which blocks until a save is confirmed.
    void persistProgress({ ...answers, [currentQuestion.id]: selectedChoice }, safeIndex);
    // The reference image is fetched by the effect keyed on the
    // persisted answer, so it isn't started here.
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
   * Finalize the exam: POSTs to the custom-exam submit endpoint (scored
   * server-side, recorded as one quiz_sessions row, XP / streak credited
   * — see app/api/student/custom-exam/[examId]/submit/route.ts), then
   * stashes the per-question result in the store for the results page
   * and routes. Errors set `submitError` so the student can retry
   * without losing their answers. If the exam is already gone (submitted
   * from another tab, or discarded) there is nothing left to retry, so
   * the student is taken to Progress, where a submitted exam is listed.
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
      // Let any in-flight progress save land BEFORE submitting: the
      // submit route deletes the saved exam, and a save arriving after
      // that would be rejected with a 404 and look like a failure.
      await saveQueueRef.current.catch(() => undefined);
      const resultData = await submitCustomExam(examId, stringKeyedAnswers);

      setLastResult({
        ...resultData,
        examId: data.examId,
        moduleCode: data.moduleCode,
        moduleName: data.moduleName,
        chapterIds: data.chapterIds,
      });
      completeSession();
      clearSession();
      router.push(`/student/results/exam/${examId}`);
    } catch (err) {
      if (err instanceof CustomExamApiError && (err.status === 404 || err.status === 409)) {
        clearSession();
        router.push('/student/dashboard?view=analytics');
        return;
      }
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

  if (!data || !progressChecked) {
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
        <p className="text-sm text-text-muted">None of this exam’s questions are available any more.</p>
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
        label="Custom exam"
        title={moduleLabel(data.moduleCode, data.moduleName)}
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
              className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white disabled:opacity-60 max-sm:h-10"
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
                isReported={reported}
                onReportOpen={() => setShowReportModal(true)}
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
            saving={savingExit}
            error={exitError}
            onSaveAndExit={handleSaveAndExit}
            onContinue={handleContinueChallenge}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReportModal && (
          <ReportQuestionModal
            key={currentQuestion.id}
            alreadyReported={reported}
            onSubmit={handleReportSubmit}
            onClose={() => setShowReportModal(false)}
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
  label,
  title,
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
  label: string;
  title: string;
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
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-6 sm:px-6 sm:py-4">
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            {label}
          </span>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        </div>

        <div className="flex items-center gap-4 max-sm:order-last max-sm:basis-full sm:flex-1">
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

        <div className="flex items-center gap-2 max-sm:ml-auto">
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
            className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-text-muted transition-all duration-200 max-sm:min-h-10 hover:border-error/30 hover:bg-error/10 hover:text-error"
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
                if (!isSelected && window.matchMedia('(hover: hover)').matches) e.currentTarget.style.borderColor = 'var(--accent-text)';
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
  isReported,
  onReportOpen,
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
  isReported: boolean;
  onReportOpen: () => void;
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
            label={isReported ? 'Reported' : 'Report'}
            onClick={onReportOpen}
            active={isReported}
            icon={<FlagIcon size={14} filled={isReported} />}
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
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition max-sm:h-10',
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
        'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-[0.16em] transition max-sm:h-10',
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
              decoding="async"
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
  saving,
  error,
  onSaveAndExit,
  onContinue,
}: {
  answeredCount: number;
  totalCount: number;
  correctCount: number;
  currentIndex: number;
  saving: boolean;
  error: string | null;
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
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl p-8 shadow-2xl mx-4"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
          <LogOutIcon size={24} className="text-error" />
        </div>

        <h2 id="exit-confirmation-title" className="mb-2 text-center text-xl font-bold text-text-primary">
          Exit Quiz?
        </h2>
        <p className="mb-2 text-center text-sm text-text-muted">
          Your answers so far will be saved, and you can pick up where you left off.
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

        {error && (
          <p role="alert" className="mb-4 text-center text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSaveAndExit}
            disabled={saving}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200 disabled:opacity-60"
            style={{ backgroundColor: 'var(--error)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--error)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--error)')}
          >
            {saving ? 'Saving…' : error ? 'Try again' : 'Save & Exit'}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={saving}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200 disabled:opacity-60"
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

/**
 * "Report this question" dialog. Collects a reason (required) and an
 * optional note, hands them to `onSubmit` (which throws on failure so
 * the message can be shown here) and then switches to a thank-you
 * state. Purely additive: it never touches answers, progress or the
 * Save & Exit flow.
 */
function ReportQuestionModal({
  alreadyReported,
  onSubmit,
  onClose,
}: {
  alreadyReported: boolean;
  onSubmit: (reason: FlagReason, detail: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSend() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(reason, detail);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const showForm = !done && !alreadyReported;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-question-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative mx-4 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl p-6 shadow-2xl sm:p-8"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgb(var(--accent-text-rgb) / 0.15)' }}
        >
          {showForm ? (
            <FlagIcon size={22} className="text-accent" />
          ) : (
            <CheckIcon size={22} className="text-success" />
          )}
        </div>

        <h2
          id="report-question-title"
          className="mb-2 text-center text-xl font-bold text-text-primary"
        >
          {done ? 'Report sent' : alreadyReported ? 'Already reported' : 'Report this question'}
        </h2>

        {!showForm ? (
          <>
            <p className="mb-6 text-center text-sm text-text-muted">
              {done
                ? 'Thanks — an admin will review this question.'
                : 'You have already reported this question. An admin will review it.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent-text)' }}
            >
              Back to quiz
            </button>
          </>
        ) : (
          <>
            <p className="mb-5 text-center text-sm text-text-muted">
              Spotted a problem? Tell the admins what is wrong and they will take a look.
            </p>

            <fieldset className="mb-4 flex flex-col gap-2" disabled={sending}>
              <legend className="sr-only">What is wrong with this question?</legend>
              {FLAG_REASONS.map((r) => {
                const selected = reason === r;
                return (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-primary transition"
                    style={{
                      border: `1px solid ${selected ? 'var(--accent-text)' : 'var(--line)'}`,
                      backgroundColor: selected
                        ? 'rgb(var(--accent-text-rgb) / 0.12)'
                        : 'var(--bg)',
                    }}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={selected}
                      onChange={() => setReason(r)}
                      className="h-4 w-4 accent-[var(--accent-text)]"
                    />
                    {FLAG_REASON_LABELS[r]}
                  </label>
                );
              })}
            </fieldset>

            <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor="report-detail">
              Details (optional)
            </label>
            <textarea
              id="report-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, FLAG_DETAIL_MAX))}
              maxLength={FLAG_DETAIL_MAX}
              rows={3}
              disabled={sending}
              placeholder="e.g. the explanation says B but the key is C"
              className="w-full resize-none rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
              style={{ border: '1px solid var(--line)', backgroundColor: 'var(--bg)' }}
            />
            <p className="mb-4 mt-1 text-right text-xs text-text-muted">
              {detail.length}/{FLAG_DETAIL_MAX}
            </p>

            {error && (
              <p role="alert" className="mb-4 text-center text-sm text-error">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-text-primary transition disabled:opacity-60"
                style={{ border: '1px solid var(--line)', backgroundColor: 'var(--bg)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!reason || sending}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-text)' }}
              >
                {sending ? 'Sending…' : error ? 'Try again' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </motion.div>
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
