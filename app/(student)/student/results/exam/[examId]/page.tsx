'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CrosshairIcon,
  RotateCcwIcon,
} from '@/components/icons';
import { useCustomExamStore } from '@/lib/custom-exam-store';
import {
  CustomExamApiError,
  createCustomExam,
  type CreateExamInput,
} from '@/lib/custom-exam-api';
import { moduleLabel } from '@/lib/dashboard-data';
import { cn } from '@/lib/utils';

/**
 * Custom Exam results screen — the same layout/behavior as the chapter
 * results screen (results/chapter/[chapterId]/page.tsx), adapted for an
 * exam that spans chapters:
 *
 *  - It renders entirely from the result the submit route returned (kept
 *    in the store): an exam is not a fetchable chapter, and that response
 *    already carries each question's topic, text and chapter.
 *  - "Solve Again" and "Practice mistakes" create a NEW exam on the server
 *    (a fresh draw from the same chapters / exactly the missed questions)
 *    and open it — there is no chapter URL to re-enter.
 *  - Each question also names the chapter it came from, so a student can
 *    see where they lost marks.
 *  - If the result isn't in this browser (another device, cleared
 *    storage), the exam is still recorded; the page says so and points at
 *    Progress instead of showing made-up numbers.
 */
export default function CustomExamResultsPage() {
  const params = useParams<{ examId: string }>();
  const examId = params.examId;
  const router = useRouter();

  const lastResult = useCustomExamStore((s) => s.lastResult);
  const sessionStartedAt = useCustomExamStore((s) => s.sessionStartedAt);
  const sessionEndedAt = useCustomExamStore((s) => s.sessionEndedAt);

  // Only this exam's result — never another exam's left in storage.
  const result = lastResult && lastResult.examId === examId ? lastResult : null;

  const breakdown = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.results.map((r) => [r.questionId, r]));
    return result.questions.map((q) => {
      const r = byId.get(q.id);
      return {
        id: q.id,
        topic: q.topic,
        preview: q.question.slice(0, 96) + (q.question.length > 96 ? '…' : ''),
        chapterName: q.chapterName,
        subjectName: q.subjectName,
        attempted: r ? r.chosen !== null : false,
        correct: r ? r.isCorrect : false,
      };
    });
  }, [result]);

  const correct = result?.score ?? 0;
  const attempted = result ? result.results.filter((r) => r.chosen !== null).length : 0;
  const accuracyTotal = result?.total ?? 0;
  const accuracy = attempted === 0 ? 0 : Math.round((correct / attempted) * 100);

  const practiceIds = result
    ? result.results.filter((r) => r.chosen !== null && !r.isCorrect).map((r) => r.questionId)
    : [];

  // Same hydration-mismatch avoidance as the chapter page: freeze the
  // "now" fallback post-mount only, never during SSR/first paint.
  const [endStamp, setEndStamp] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!endStamp) setEndStamp(sessionEndedAt ?? Date.now());
  }, [sessionEndedAt, endStamp]);

  const elapsedMs = sessionStartedAt && endStamp ? Math.max(0, endStamp - sessionStartedAt) : 0;

  const [starting, setStarting] = useState<'again' | 'mistakes' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  async function startNewExam(kind: 'again' | 'mistakes', input: CreateExamInput) {
    if (starting) return;
    setStartError(null);
    setStarting(kind);
    try {
      const { examId: newId } = await createCustomExam(input);
      router.push(`/student/quiz/exam/${newId}`);
    } catch (err) {
      setStartError(
        err instanceof CustomExamApiError && err.available !== undefined
          ? err.available === 0
            ? 'Those questions are not available any more.'
            : `Only ${err.available} question${err.available === 1 ? ' is' : 's are'} available for this selection now.`
          : err instanceof Error
            ? err.message
            : "Couldn't start the exam. Try again."
      );
      setStarting(null);
    }
  }

  function handleSolveAgain() {
    if (!result) return;
    void startNewExam('again', {
      moduleCode: result.moduleCode,
      chapterIds: result.chapterIds,
      count: result.total,
    });
  }

  function handleQuizMistakes() {
    if (!result || practiceIds.length === 0) return;
    void startNewExam('mistakes', {
      moduleCode: result.moduleCode,
      questionIds: practiceIds,
    });
  }

  const accentToken = accuracy >= 80 ? 'success' : accuracy >= 60 ? 'accent-text' : 'error';
  const accentColor = `var(--${accentToken})`;

  if (!result) {
    return (
      <main className="min-h-screen w-full" style={{ backgroundColor: 'var(--bg)' }}>
        <Header />
        <div className="mx-auto w-full max-w-xl px-6 pb-24 pt-20 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            This report isn’t on this device
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Your exam was recorded. The detailed breakdown is only kept in the browser you took it
            in, but the score is on your Progress page.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/student/dashboard?view=analytics"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent-text)' }}
            >
              View Progress
              <ArrowRightIcon size={16} />
            </Link>
            <Link
              href="/student/exam"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-text-primary transition"
              style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}
            >
              <ArrowLeftIcon size={16} />
              Back to Custom Exam
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
        }}
        className="mx-auto w-full max-w-5xl px-6 pb-24 pt-14"
      >
        <FadeUp>
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Custom exam report · {moduleLabel(result.moduleCode, result.moduleName)}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary md:text-[38px]">
                {correct}
                <span className="text-text-muted"> / {accuracyTotal}</span>{' '}
                <span className="text-lg font-normal text-text-muted">correct</span>
              </h1>
              <div
                className="flex items-baseline gap-2 rounded-xl px-4 py-2"
                style={{
                  backgroundColor: `rgb(var(--${accentToken}-rgb) / 0.14)`,
                  border: `1px solid rgb(var(--${accentToken}-rgb) / 0.4)`,
                }}
              >
                <span className="text-2xl font-semibold" style={{ color: accentColor }}>
                  {accuracy}%
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  accuracy
                </span>
              </div>
            </div>
            <p className="text-sm text-text-muted">
              {attempted === accuracyTotal
                ? 'You answered every question in this exam.'
                : `${attempted} of ${accuracyTotal} attempted · ${accuracyTotal - attempted} skipped`}
            </p>
          </div>
        </FadeUp>

        <FadeUp className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard
              label="Score"
              value={`${correct} / ${accuracyTotal}`}
              color="var(--accent-text)"
              footnote={`${attempted - correct} incorrect · ${accuracyTotal - attempted} skipped`}
            />
            <ScoreCard
              label="XP earned"
              value={`+${result.xpEarned}`}
              color="#F59E0B"
              footnote="Toward the leaderboard"
            />
            <ScoreCard
              label="Accuracy"
              value={`${accuracy}%`}
              color={accentColor}
              footnote={attempted === 0 ? 'No questions attempted' : 'Across attempted items'}
            />
            <ScoreCard
              label="Time"
              value={formatDuration(elapsedMs)}
              color="var(--accent-text)"
              footnote={
                attempted > 0
                  ? `${formatDuration(elapsedMs / Math.max(1, attempted))} per attempt`
                  : 'No time recorded'
              }
            />
          </div>
        </FadeUp>

        <FadeUp className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleSolveAgain}
              disabled={starting !== null}
              className="group inline-flex h-12 items-center sm:flex-1 justify-center gap-2 rounded-xl text-sm font-semibold text-white transition hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent-text)' }}
            >
              <RotateCcwIcon size={16} />
              {starting === 'again' ? 'Starting…' : 'Solve Again'}
              <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={handleQuizMistakes}
              disabled={practiceIds.length === 0 || starting !== null}
              className="group inline-flex h-12 items-center sm:flex-1 justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-glow)' }}
            >
              <CrosshairIcon size={16} />
              {starting === 'mistakes' ? 'Starting…' : 'Practice mistakes'}
              {practiceIds.length > 0 && starting !== 'mistakes' && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                >
                  {practiceIds.length}
                </span>
              )}
              <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
            </button>
            <Link
              href="/student/exam"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-text-primary transition"
              style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}
            >
              <ArrowLeftIcon size={16} />
              Back to Custom Exam
            </Link>
          </div>
          {startError && (
            <p
              role="alert"
              className="mt-3 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgb(var(--error-rgb) / 0.08)',
                border: '1px solid rgb(var(--error-rgb) / 0.35)',
                color: 'var(--error)',
              }}
            >
              {startError}
            </p>
          )}
        </FadeUp>

        <FadeUp className="mt-10">
          <Card>
            <CardHeader
              title="At a glance"
              subtitle={`${accuracyTotal} questions, in order.`}
              accessory={
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  <LegendDot color="var(--success)" label="Correct" />
                  <LegendDot color="var(--error)" label="Incorrect" />
                  <LegendDot color="var(--text3)" label="Skipped" />
                </div>
              }
            />
            <div className="mt-5 flex flex-wrap gap-2">
              {breakdown.map((b, i) => (
                <BreakdownPill
                  key={b.id}
                  index={i + 1}
                  state={b.correct ? 'correct' : b.attempted ? 'incorrect' : 'skipped'}
                />
              ))}
            </div>
          </Card>
        </FadeUp>

        <FadeUp className="mt-6">
          <Card>
            <CardHeader
              title="Per-question detail"
              subtitle="Chapter, topic and outcome for each item."
            />
            <ul className="mt-4 divide-y" style={{ borderColor: 'var(--line)' }}>
              {breakdown.map((b, i) => {
                const state = b.correct ? 'correct' : b.attempted ? 'incorrect' : 'skipped';
                return (
                  <li
                    key={b.id}
                    className="flex items-start gap-4 py-3"
                    style={{ borderTop: i === 0 ? '1px solid transparent' : undefined }}
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid h-7 w-10 shrink-0 place-items-center rounded-md text-xs font-semibold',
                        state === 'correct' && 'bg-success/15 text-success',
                        state === 'incorrect' && 'bg-error/15 text-error',
                        state === 'skipped' && 'bg-input text-text-muted'
                      )}
                    >
                      Q{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-accent/80">
                        {b.topic}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-text-primary">{b.preview}</p>
                      {b.chapterName && (
                        <p className="mt-1 text-[11px] text-text-muted">
                          {[b.subjectName, b.chapterName].filter(Boolean).join(' › ')}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 self-center text-xs font-medium',
                        state === 'correct' && 'text-success',
                        state === 'incorrect' && 'text-error',
                        state === 'skipped' && 'text-text-muted'
                      )}
                    >
                      {state === 'correct' && (
                        <span className="inline-flex items-center gap-1">
                          <CheckIcon size={14} /> Correct
                        </span>
                      )}
                      {state === 'incorrect' && (
                        <span className="inline-flex items-center gap-1">
                          <CloseIcon size={14} /> Incorrect
                        </span>
                      )}
                      {state === 'skipped' && 'Skipped'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </FadeUp>
      </motion.div>
    </main>
  );
}

function Header() {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{ backgroundColor: 'var(--nav-bg)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/student/catalogue" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-text-primary">
            MediZee
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            · Results
          </span>
        </Link>
      </div>
    </header>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}>
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  accessory,
}: {
  title: string;
  subtitle?: string;
  accessory?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      {accessory}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  color,
  footnote,
}: {
  label: string;
  value: string;
  color: string;
  footnote: string;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}>
      <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">{label}</span>
      <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-text-muted">{footnote}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function BreakdownPill({
  index,
  state,
}: {
  index: number;
  state: 'correct' | 'incorrect' | 'skipped';
}) {
  const palette = {
    correct: {
      bg: 'rgb(var(--success-rgb) / 0.12)',
      border: 'rgb(var(--success-rgb) / 0.45)',
      color: 'var(--success)',
      icon: <CheckIcon size={12} />,
    },
    incorrect: {
      bg: 'rgb(var(--error-rgb) / 0.12)',
      border: 'rgb(var(--error-rgb) / 0.45)',
      color: 'var(--error)',
      icon: <CloseIcon size={12} />,
    },
    skipped: {
      bg: 'var(--fill)',
      border: 'var(--line)',
      color: 'var(--text3)',
      icon: null,
    },
  }[state];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: palette.bg, border: `1px solid ${palette.border}`, color: palette.color }}
    >
      Q{index}
      {palette.icon}
    </span>
  );
}

function FadeUp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
