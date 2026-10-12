'use client';

import type { ReactNode } from 'react';
import { MailIcon } from '@/components/icons';
import { Avatar } from '@/components/student/Avatar';
import { academicSession, formatAcademicYear, formatSession } from '@/lib/academic-year';
import type { StudentProfileDto } from '@/lib/student-profile';
import type { LeaderboardRow } from '@/lib/supabase';

function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  const accent = tone === 'accent';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: accent ? 'var(--accent-text)' : 'var(--text2)',
        background: accent ? 'rgb(var(--accent-text-rgb) / 0.12)' : 'var(--fill)',
        border: `1px solid ${accent ? 'rgb(var(--accent-text-rgb) / 0.3)' : 'var(--line)'}`,
      }}
    >
      {children}
    </span>
  );
}

export function ProfileHeader({
  profile,
  rank,
  loading,
}: {
  profile: StudentProfileDto | null;
  rank: LeaderboardRow | null;
  loading: boolean;
}) {
  const name = profile?.fullName || '';
  const joined = profile?.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  return (
    <section
      style={{
        marginTop: 32,
        padding: 24,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <Avatar name={name} size={72} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {name || (loading ? '…' : 'Student')}
        </div>
        {profile?.username && (
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>@{profile.username}</div>
        )}
        <div
          style={{
            fontSize: 13,
            color: 'var(--text3)',
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            wordBreak: 'break-all',
          }}
        >
          <MailIcon size={12} />
          {profile?.email || (loading ? '…' : 'No email on file')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {profile?.academicYear != null ? (
            <Chip tone="accent">
              {formatAcademicYear(profile.academicYear)} · {formatSession(academicSession())}
            </Chip>
          ) : (
            !loading && <Chip>Year not set</Chip>
          )}
          {rank && <Chip>Rank #{rank.rank}</Chip>}
          {profile && <Chip>{profile.totalXp.toLocaleString('en-US')} XP</Chip>}
          {joined && <Chip>Joined {joined}</Chip>}
        </div>
      </div>
    </section>
  );
}
