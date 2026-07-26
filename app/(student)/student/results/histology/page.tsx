'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Crosshair,
  Target,
  X,
} from 'lucide-react';
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

  const [endStamp, setEndStamp] = useState<number | null>(null);
  useEffect(() => {
    if (!endStamp) setEndStamp(sessionEndedAt ?? Date.now());
  }, [sessionEndedAt, endStamp]);

  const elapsedMs =
    sessionStartedAt && endStamp ? Math.max(0, endStamp - sessionStartedAt) : 0;

  function handleQuizMistakes() {
    if (practiceIds.length === 0) return;
    startMistakeSession(practiceIds);
    router.push('/student/quiz/histology?mode=mistakes');
  }

  const accentColor =
    accuracy >= 80 ? '#10B981' : accuracy >= 60 ? '#9F67FF' : '#EF4444';

  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: '#09090E' }}>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
              Session report · {histologySubject.name}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[38px]">
                {correct}
                <span className="text-text-muted"> / {accuracyTotal}</span>{' '}
                <span className="text-lg font-normal text-text-muted">correct</span>
              </h1>
              <div
                className="flex items-baseline gap-2 rounded-xl px-4 py-2"
                style={{
                  backgroundColor: `${accentColor}18`,
                  border: `1px solid ${accentColor}55`,
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

        {/* KPI row — three restrained metric tiles, no emoji. */}
        <FadeUp className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ScoreCard
              icon={<Target className="h-4 w-4" />}
              label="Score"
              value={`${correct} / ${accuracyTotal}`}
              accent="#9F67FF"
              footnote={`${attempted - correct} incorrect · ${accuracyTotal - attempted} skipped`}
            />
            <ScoreCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="Accuracy"
              value={`${accuracy}%`}
              accent={accentColor}
              footnote={attempted === 0 ? 'No questions attempted' : 'Across attempted items'}
            />
            <ScoreCard
              icon={<Clock className="h-4 w-4" />}
              label="Time"
              value={formatDuration(elapsedMs)}
              accent="#9F67FF"
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
              className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition"
              style={{
                backgroundColor: '#7C3AED',
                boxShadow: '0 0 28px rgba(124,58,237,0.5)',
              }}
            >
              <BarChart3 className="h-4 w-4" />
              Continue to Analytics
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={handleQuizMistakes}
              disabled={practiceIds.length === 0}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundColor: 'rgba(124,58,237,0.16)',
                border: '1px solid rgba(159,103,255,0.45)',
              }}
            >
              <Crosshair className="h-4 w-4" />
              Practice mistakes
              {practiceIds.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
                >
                  {practiceIds.length}
                </span>
              )}
            </button>
            <Link
              href="/student/dashboard"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-text-primary transition hover:text-white"
              style={{ border: '1px solid #1E1E2E', backgroundColor: '#0F0F1A' }}
            >
              <ArrowLeft className="h-4 w-4" />
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
                  <LegendDot color="#10B981" label="Correct" />
                  <LegendDot color="#EF4444" label="Incorrect" />
                  <LegendDot color="#334155" label="Skipped" />
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
            <ul className="mt-4 divide-y" style={{ borderColor: '#1E1E2E' }}>
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
                        state === 'correct' && 'bg-emerald-500/15 text-emerald-300',
                        state === 'incorrect' && 'bg-rose-500/15 text-rose-300',
                        state === 'skipped' && 'bg-white/5 text-text-muted'
                      )}
                    >
                      Q{i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300/80">
                        {b.topic}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-text-primary">
                        {b.preview}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 self-center text-xs font-medium',
                        state === 'correct' && 'text-emerald-300',
                        state === 'incorrect' && 'text-rose-300',
                        state === 'skipped' && 'text-text-muted'
                      )}
                    >
                      {state === 'correct' && (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Correct
                        </span>
                      )}
                      {state === 'incorrect' && (
                        <span className="inline-flex items-center gap-1">
                          <X className="h-3.5 w-3.5" /> Incorrect
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
        backgroundColor: 'rgba(9, 9, 14, 0.85)',
        borderBottom: '1px solid #1E1E2E',
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/student/dashboard" className="flex items-center gap-2">
          <span
            className="text-lg font-bold tracking-tight text-white"
            style={{ textShadow: '0 0 14px rgba(124,58,237,0.5)' }}
          >
            MedZ
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
            · Results
          </span>
        </Link>
        <Link
          href="/student/dashboard?view=analytics"
          className="text-xs text-text-muted hover:text-white"
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
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
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
        <h2 className="text-base font-semibold tracking-tight text-white">
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
  icon,
  label,
  value,
  accent,
  footnote,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  footnote: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full"
        style={{ background: `${accent}30`, filter: 'blur(36px)' }}
      />
      <div className="relative flex items-center justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}25`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
          {label}
        </span>
      </div>
      <p
        className="mt-5 text-3xl font-semibold tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-text-muted">{footnote}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
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
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.45)',
      color: '#6EE7B7',
      icon: <Check className="h-3 w-3" />,
    },
    incorrect: {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.45)',
      color: '#FCA5A5',
      icon: <X className="h-3 w-3" />,
    },
    skipped: {
      bg: 'rgba(255,255,255,0.04)',
      border: '#1E1E2E',
      color: '#94A3B8',
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
