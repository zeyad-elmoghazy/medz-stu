'use client';

import Link from 'next/link';
import type { StudentStats } from '@/lib/dashboard-data';
import type { StudentBadge } from '@/lib/student-profile';
import type { LeaderboardRow } from '@/lib/supabase';
import { formatRelativeDate } from '@/lib/streak-utils';
import { Card } from './ui';
import { LinkPending } from '@/components/ui/LinkPending';

const tile = {
  padding: '14px 16px',
  background: 'var(--fill)',
  border: '1px solid var(--line)',
  borderRadius: 12,
} as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={tile}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{label}</div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 800,
          color: 'var(--text)',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      {hint && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text3)' }}>{hint}</div>}
    </div>
  );
}

export function StatsOverview({
  stats,
  totalXp,
  rank,
  loading,
}: {
  stats: StudentStats | null;
  totalXp: number | null;
  rank: LeaderboardRow | null;
  loading: boolean;
}) {
  const dash = loading ? '…' : '—';
  const hasActivity = (stats?.totalQuestionsAnswered ?? 0) > 0;

  return (
    <Card title="Your progress">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <StatTile
          label="Total XP"
          value={totalXp != null ? totalXp.toLocaleString('en-US') : dash}
        />
        <StatTile label="Leaderboard rank" value={rank ? `#${rank.rank}` : dash} hint={rank ? undefined : 'Answer questions to get ranked'} />
        <StatTile
          label="Current streak"
          value={stats ? `${stats.streakDays} ${stats.streakDays === 1 ? 'day' : 'days'}` : dash}
        />
        <StatTile
          label="Overall accuracy"
          value={stats && hasActivity ? `${stats.overallAccuracy}%` : dash}
        />
        <StatTile
          label="Questions answered"
          value={stats ? stats.totalQuestionsAnswered.toLocaleString('en-US') : dash}
          hint={stats && hasActivity ? `${stats.totalCorrectAnswers.toLocaleString('en-US')} correct` : undefined}
        />
        <StatTile
          label="Last active"
          value={stats && hasActivity ? formatRelativeDate(stats.lastActiveDate) : dash}
        />
      </div>
    </Card>
  );
}

export function SubjectProgress({ stats }: { stats: StudentStats | null }) {
  const subjects = (stats?.subjects ?? []).filter((s) => s.available !== false);
  const hasActivity = subjects.some((s) => s.questionsAnswered > 0);

  return (
    <Card title="Progress by subject" description="Accuracy across the questions you've answered in each subject.">
      {!hasActivity ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
          Nothing here yet.{' '}
          <Link href="/student/catalogue" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>
            Start your first quiz
            <LinkPending />
          </Link>{' '}
          to see how you&apos;re doing in each subject.
        </p>
      ) : (
        subjects.map((s) => (
          <div key={s.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.name}</span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                {s.questionsAnswered > 0
                  ? `${Math.round(s.accuracy)}% · ${s.questionsAnswered} answered`
                  : 'Not started'}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${s.name} accuracy`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.accuracy)}
              style={{
                marginTop: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--line)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, s.accuracy))}%`,
                  height: '100%',
                  background: 'var(--accent-text)',
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// Streak badges awarded by the 015 schema: flair only, no functional unlock.
const BADGE_SLOTS: Array<{ type: string; label: string; days: number }> = [
  { type: 'streak_7', label: '7-day streak', days: 7 },
  { type: 'streak_14', label: '14-day streak', days: 14 },
  { type: 'streak_30', label: '30-day streak', days: 30 },
];

export function BadgesCard({ badges }: { badges: StudentBadge[] }) {
  const earned = new Set(badges.map((b) => b.type));
  return (
    <Card title="Badges" description="Keep a daily streak going to earn these.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {BADGE_SLOTS.map((slot) => {
          const got = earned.has(slot.type);
          return (
            <div
              key={slot.type}
              title={got ? 'Earned' : 'Locked'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                color: got ? 'var(--accent-text)' : 'var(--text3)',
                background: got ? 'rgb(var(--accent-text-rgb) / 0.12)' : 'var(--fill)',
                border: `1px solid ${got ? 'rgb(var(--accent-text-rgb) / 0.3)' : 'var(--line)'}`,
                opacity: got ? 1 : 0.7,
              }}
            >
              <span aria-hidden>{got ? '🔥' : '🔒'}</span>
              {slot.label}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{got ? 'Earned' : 'Locked'}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function QuickLinks({ bookmarksCount }: { bookmarksCount: number | null }) {
  const links: Array<{ href: string; label: string; hint: string }> = [
    {
      href: '/student/bookmarks',
      label: 'Bookmarks',
      hint: bookmarksCount == null ? 'Saved questions' : `${bookmarksCount} saved`,
    },
    { href: '/student/dashboard?view=analytics', label: 'My analytics', hint: 'Trends and weak spots' },
    { href: '/student/leaderboard', label: 'Leaderboard', hint: 'See where you stand' },
  ];
  return (
    <Card title="Shortcuts">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href} style={{ ...tile, textDecoration: 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.label}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text3)' }}>{l.hint}</div>
            <LinkPending />
          </Link>
        ))}
      </div>
    </Card>
  );
}
