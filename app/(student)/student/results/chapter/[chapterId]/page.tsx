'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Crosshair,
  RotateCcw,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import { fetchChapterQuiz, type ChapterQuiz } from '@/lib/chapter-quiz-api';
import { cn } from '@/lib/utils';

/**
 * Chapter-scoped results screen — same layout/behavior as the
 * reference results/histology/page.tsx (read-only reference here,
 * never imported/edited), adapted to re-fetch the chapter's question
 * list (chapter questions aren't a static importable module like
 * histologyQuestions) and to drop the "Continue to Analytics" CTA,
 * since analytics is built from `quiz_sessions`, which this endpoint
 * deliberately doesn't write to — see
 * app/api/student/chapters/[chapterId]/submit/route.ts for why (it
 * earns XP/leaderboard credit instead of a session-history row).
 */
export default function ChapterResultsPage() {
  const params = useParams<{ chapterId: string }>();
  const chapterId = params.chapterId;
  const router = useRouter();

  const lastResult = useChapterQuizStore((s) => s.lastResult);
  const sessionStartedAt = useChapterQuizStore((s) => s.sessionStartedAt);
  const sessionEndedAt = useChapterQuizStore((s) => s.sessionEndedAt);
  const mistakeQuestionIdsByChapter = useChapterQuizStore((s) => s.mistakeQuestionIdsByChapter);
  const startMistakeSession = useChapterQuizStore((s) => s.startMistakeSession);
  const startSession = useChapterQuizStore((s) => s.startSession);

  const [data, setData] = useState<ChapterQuiz | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChapterQuiz(chapterId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Non-fatal — the KPI row still renders from lastResult
        // alone; only the per-question topic/preview breakdown
        // needs this fetch.
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const lastResultMap = useMemo(() => {
    if (!lastResult) return null;
    const m = new Map<number, { isCorrect: boolean; chosen: string | null }>();
    for (const r of lastResult.results) {
      m.set(r.questionId, { isCorrect: r.isCorrect, chosen: r.chosen });
    }
    return m;
  }, [lastResult]);

  const breakdown = useMemo(
    () =>
      (data?.questions ?? []).map((q) => {
        const r = lastResultMap?.get(q.id);
        return {
          id: q.id,
          topic: q.topic,
          preview: q.question.slice(0, 96) + (q.question.length > 96 ? '…' : ''),
          attempted: r ? r.chosen !== null : false,
          correct: r ? r.isCorrect : false,
        };
      }),
    [data, lastResultMap]
  );

  const correct = lastResult?.score ?? breakdown.filter((b) => b.correct).length;
  const attempted = lastResult
    ? lastResult.results.filter((r) => r.chosen !== null).length
    : breakdown.filter((b) => b.attempted).length;
  const accuracyTotal = lastResult?.total ?? (data?.questions.length ?? 0);
  const accuracy = attempted === 0 ? 0 : Math.round((correct / attempted) * 100);

  const recentMistakeIds = lastResult
    ? lastResult.results.filter((r) => r.chosen !== null && !r.isCorrect).map((r) => r.questionId)
    : breakdown.filter((b) => b.attempted && !b.correct).map((b) => b.id);
  const persistentMistakeIds = mistakeQuestionIdsByChapter[chapterId] ?? [];
  const practiceIds = recentMistakeIds.length > 0 ? recentMistakeIds : persistentMistakeIds;

  // Same hydration-mismatch avoidance as the reference page: freeze
  // the "now" fallback post-mount only, never during SSR/first paint.
  const [endStamp, setEndStamp] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!endStamp) setEndStamp(sessionEndedAt ?? Date.now());
  }, [sessionEndedAt, endStamp]);

  const elapsedMs = sessionStartedAt && endStamp ? Math.max(0, endStamp - sessionStartedAt) : 0;

  function handleQuizMistakes() {
    if (practiceIds.length === 0) return;
    startMistakeSession(chapterId, practiceIds);
    router.push(`/student/quiz/chapter/${chapterId}`);
  }

  function handleSolveAgain() {
    startSession();
    router.push(`/student/quiz/chapter/${chapterId}`);
  }

  const accentColor = accuracy >= 80 ? '#10B981' : accuracy >= 60 ? '#33BFBF' : '#EF4444';
  const chapterName = data?.chapterName ?? 'Chapter';

  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: '#0B1F33' }}>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#33BFBF]">
              Session report · {chapterName}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[38px]">
                {correct}
                <span className="text-text-muted"> / {accuracyTotal}</span>{' '}
                <span className="text-lg font-normal text-text-muted">correct</span>
              </h1>
              <div
                className="flex items-baseline gap-2 rounded-xl px-4 py-2"
                style={{ backgroundColor: `${accentColor}18`, border: `1px solid ${accentColor}55` }}
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
                ? 'You answered every question in this chapter.'
                : `${attempted} of ${accuracyTotal} attempted · ${accuracyTotal - attempted} skipped`}
            </p>
          </div>
        </FadeUp>

        <FadeUp className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard
              icon={<Target className="h-4 w-4" />}
              label="Score"
              value={`${correct} / ${accuracyTotal}`}
              accent="#33BFBF"
              footnote={`${attempted - correct} incorrect · ${accuracyTotal - attempted} skipped`}
            />
            <ScoreCard
              icon={<Zap className="h-4 w-4" />}
              label="XP earned"
              value={lastResult ? `+${lastResult.xpEarned}` : '—'}
              accent="#F59E0B"
              footnote="Toward the leaderboard"
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
              accent="#33BFBF"
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
              className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#00A6A6', boxShadow: '0 0 28px rgba(0,166,166,0.5)' }}
            >
              <RotateCcw className="h-4 w-4" />
              Solve Again
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={handleQuizMistakes}
              disabled={practiceIds.length === 0}
              className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: '#33BFBF', boxShadow: '0 0 28px rgba(51,191,191,0.5)' }}
            >
              <Crosshair className="h-4 w-4" />
              Practice mistakes
              {practiceIds.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                >
                  {practiceIds.length}
                </span>
              )}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <Link
              href="/student/catalogue"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-text-primary transition hover:text-white"
              style={{ border: '1px solid #132B45', backgroundColor: '#132B45' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalogue
            </Link>
          </div>
        </FadeUp>

        <FadeUp className="mt-10">
          <Card>
            <CardHeader
              title="At a glance"
              subtitle={`${accuracyTotal} questions, in order.`}
              accessory={
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  <LegendDot color="#10B981" label="Correct" />
                  <LegendDot color="#EF4444" label="Incorrect" />
                  <LegendDot color="#8B98A6" label="Skipped" />
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
            <CardHeader title="Per-question detail" subtitle="Topic and outcome for each item." />
            <ul className="mt-4 divide-y" style={{ borderColor: '#132B45' }}>
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
                        state === 'correct' && 'bg-emerald-500/15 text-emerald-300',
                        state === 'incorrect' && 'bg-rose-500/15 text-rose-300',
                        state === 'skipped' && 'bg-white/5 text-text-muted'
                      )}
                    >
                      Q{i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#33BFBF]/80">
                        {b.topic}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-text-primary">{b.preview}</p>
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
      style={{ backgroundColor: 'rgba(9, 9, 14, 0.85)', borderBottom: '1px solid #132B45' }}
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/student/catalogue" className="flex items-center gap-2">
          <span
            className="text-lg font-bold tracking-tight text-white"
            style={{ textShadow: '0 0 14px rgba(0,166,166,0.5)' }}
          >
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
    <div className="rounded-2xl p-6" style={{ backgroundColor: '#132B45', border: '1px solid #132B45' }}>
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
        <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
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
    <div className="relative overflow-hidden rounded-2xl p-5" style={{ backgroundColor: '#132B45', border: '1px solid #132B45' }}>
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
        <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">{label}</span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight" style={{ color: accent }}>
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
      border: '#132B45',
      color: '#8B98A6',
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
