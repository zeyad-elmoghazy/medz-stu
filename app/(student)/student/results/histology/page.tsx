'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CrosshairIcon,
} from '@/components/icons';
import { useQuizStore } from '@/lib/store';
import { histologyQuestions, histologySubject } from '@/data/histology-questions';
import { cn } from '@/lib/utils';

export default function HistologyResultsPage() {
  return (
    <Suspense fallback={null}>
      <HistologyResultsInner />
    </Suspense>
  );
}

function HistologyResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const lastResult = useQuizStore((s) => s.lastResult);
  const sessionStartedAt = useQuizStore((s) => s.sessionStartedAt);
  const sessionEndedAt = useQuizStore((s) => s.sessionEndedAt);
  const mistakeQuestionIds = useQuizStore((s) => s.mistakeQuestionIds);
  const startMistakeSession = useQuizStore((s) => s.startMistakeSession);

  const total = histologyQuestions.length;

  // Prefer the in-store lastResult (set by the quiz page for both
  // demo AND real mode BEFORE clearSession). Fall back to URL
  // query params for hard-refresh cases.
  const lastResultMap = useMemo(() => {
    if (!lastResult) return null;
    const m = new Map<number, { isCorrect: boolean; chosen: string | null }>();
    for (const r of lastResult.results) {
      m.set(r.questionId, { isCorrect: r.isCorrect, chosen: r.chosen });
    }
    return m;
  }, [lastResult]);

  const queryScore = Number(searchParams.get('score') ?? '');
  const queryTotal = Number(searchParams.get('total') ?? '');
  const queryValid =
    Number.isFinite(queryScore) &&
    Number.isFinite(queryTotal) &&
    queryTotal > 0;

  const breakdown = useMemo(
    () =>
      histologyQuestions.map((q) => {
        if (lastResultMap?.has(q.id)) {
          const r = lastResultMap.get(q.id)!;
          return {
            id: q.id,
            topic: q.topic,
            preview:
              q.question.slice(0, 96) + (q.question.length > 96 ? '…' : ''),
            attempted: r.chosen !== null,
            correct: r.isCorrect,
          };
        }
        return {
          id: q.id,
          topic: q.topic,
          preview:
            q.question.slice(0, 96) + (q.question.length > 96 ? '…' : ''),
          attempted: false,
          correct: false,
        };
      }),
    [lastResultMap]
  );

  const correct = lastResult
    ? lastResult.score
    : queryValid
      ? queryScore
      : breakdown.filter((b) => b.correct).length;

  const attempted = lastResult
    ? lastResult.results.filter((r) => r.chosen !== null).length
    : breakdown.filter((b) => b.attempted).length;

  const accuracyTotal = lastResult?.total ?? (queryValid ? queryTotal : total);
  const accuracy =
    attempted === 0 ? 0 : Math.round((correct / attempted) * 100);

  // Recent-session mistakes first (what they just got wrong).
  // If none, fall back to the persistent pool so they can still
  // practice historical mistakes from this screen.
  const recentMistakeIds = lastResult
    ? lastResult.results.filter((r) => r.chosen !== null && !r.isCorrect).map((r) => r.questionId)
    : breakdown.filter((b) => b.attempted && !b.correct).map((b) => b.id);
  const practiceIds = recentMistakeIds.length > 0 ? recentMistakeIds : mistakeQuestionIds;

  // This page is server-rendered once before hydration. Computing the
  // Date.now() fallback during that shared initial render (eager or
  // lazy useState) would capture a different wall-clock moment on the
  // server than on the client, and since this feeds displayed elapsed
  // time, that's a real hydration mismatch — not just a stale value.
  // Starting at null (matching on both sides) and only resolving it
  // post-mount, client-only, avoids that. The guard makes this
  // compute-once-and-freeze; nothing else ever sets endStamp.
  const [endStamp, setEndStamp] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!endStamp) setEndStamp(sessionEndedAt ?? Date.now());
  }, [sessionEndedAt, endStamp]);

  const elapsedMs =
    sessionStartedAt && endStamp ? Math.max(0, endStamp - sessionStartedAt) : 0;

  function handleQuizMistakes() {
    if (practiceIds.length === 0) return;
    startMistakeSession(practiceIds);
    router.push('/student/quiz/histology?mode=mistakes');
  }

  const accentToken = accuracy >= 80 ? 'success' : accuracy >= 60 ? 'accent-text' : 'error';
  const accentColor = `var(--${accentToken})`;

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
        {/* Report header — no celebratory iconography. */}
        <FadeUp>
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Session report · {histologySubject.name}
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
                ? 'You answered every question in this block.'
                : `${attempted} of ${accuracyTotal} attempted · ${accuracyTotal - attempted} skipped`}
            </p>
          </div>
        </FadeUp>

        {/* KPI row — three restrained metric tiles, no emoji, no icon
            squares (typography does the work). */}
        <FadeUp className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ScoreCard
              label="Score"
              value={`${correct} / ${accuracyTotal}`}
              accentToken="accent-text"
              footnote={`${attempted - correct} incorrect · ${accuracyTotal - attempted} skipped`}
            />
            <ScoreCard
              label="Accuracy"
              value={`${accuracy}%`}
              accentToken={accentToken}
              footnote={attempted === 0 ? 'No questions attempted' : 'Across attempted items'}
            />
            <ScoreCard
              label="Time"
              value={formatDuration(elapsedMs)}
              accentToken="accent-text"
              footnote={
                attempted > 0
                  ? `${formatDuration(elapsedMs / Math.max(1, attempted))} per attempt`
                  : 'No time recorded'
              }
            />
          </div>
        </FadeUp>

        {/* Primary CTAs — analytics is the intended destination. */}
        <FadeUp className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/student/dashboard?view=analytics"
              className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition hover:bg-accent-glow"
              style={{ backgroundColor: 'var(--accent-text)' }}
            >
              Continue to Analytics
              <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={handleQuizMistakes}
              disabled={practiceIds.length === 0}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundColor: 'rgb(var(--accent-text-rgb) / 0.12)',
                border: '1px solid rgb(var(--accent-text-rgb) / 0.4)',
              }}
            >
              <CrosshairIcon size={16} />
              Practice mistakes
              {practiceIds.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: 'rgb(var(--accent-text-rgb) / 0.2)' }}
                >
                  {practiceIds.length}
                </span>
              )}
            </button>
            <Link
              href="/student/dashboard"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-text-primary transition"
              style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}
            >
              <ArrowLeftIcon size={16} />
              Dashboard
            </Link>
          </div>
        </FadeUp>

        {/* Grid overview — every question, one glyph each. */}
        <FadeUp className="mt-10">
          <Card>
            <CardHeader
              title="At a glance"
              subtitle={`${accuracyTotal} questions, in order.`}
              accessory={
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  <LegendDot token="success" label="Correct" />
                  <LegendDot token="error" label="Incorrect" />
                  <LegendDot token="muted" label="Skipped" />
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

        {/* Per-question table — professional layout, no icons in tags. */}
        <FadeUp className="mt-6">
          <Card>
            <CardHeader
              title="Per-question detail"
              subtitle="Topic and outcome for each item."
            />
            <ul className="mt-4 divide-y" style={{ borderColor: 'var(--line)' }}>
              {breakdown.map((b, i) => {
                const state = b.correct
                  ? 'correct'
                  : b.attempted
                    ? 'incorrect'
                    : 'skipped';
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
                    <div className="flex-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-accent/80">
                        {b.topic}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-text-primary">
                        {b.preview}
                      </p>
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
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/student/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-text-primary">
            MediZee
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            · Results
          </span>
        </Link>
        <Link
          href="/student/dashboard?view=analytics"
          className="text-xs text-text-muted hover:text-text-primary"
        >
          Analytics
        </Link>
      </div>
    </header>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
    >
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
        <h2 className="text-base font-semibold tracking-tight text-text-primary">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        )}
      </div>
      {accessory}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  accentToken,
  footnote,
}: {
  label: string;
  value: string;
  accentToken: string;
  footnote: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
        {label}
      </span>
      <p
        className="mt-2 text-3xl font-semibold tracking-tight"
        style={{ color: `var(--${accentToken})` }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-text-muted">{footnote}</p>
    </div>
  );
}

function LegendDot({ token, label }: { token: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: token === 'muted' ? 'var(--text3)' : `var(--${token})` }}
      />
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
      style={{
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
    >
      Q{index}
      {palette.icon}
    </span>
  );
}

function FadeUp({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
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
