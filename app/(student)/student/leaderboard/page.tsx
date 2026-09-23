'use client';

import { useEffect, useState } from 'react';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { isDemoMode, type LeaderboardRow } from '@/lib/supabase';
import { useDisplayName } from '@/lib/use-display-name';

// Badge flair — mirrors the streak_7/14/30 types in the `badges`
// table (supabase/migrations/015_b2c_pivot_rebuild.sql), "flair
// only, no functional unlock" per the product doc.
const BADGE_LABEL: Record<string, string> = {
  streak_30: '🔥 30-day streak',
  streak_14: '🔥 14-day streak',
  streak_7: '🔥 7-day streak',
};

type LeaderboardPayload = { top10: LeaderboardRow[]; me: LeaderboardRow | null };

// Demo mode has no real student cohort — a small static top10 plus
// a "me" row lets the page be exercised without a live Supabase
// session, mirroring getEmptyStudentStats() in lib/dashboard-data.ts.
function getDemoLeaderboardPayload(): LeaderboardPayload {
  const demoNames = ['Layla', 'Omar', 'Sara', 'Youssef', 'Mona', 'Karim', 'Nour', 'Ziad', 'Hana', 'Ahmed'];
  const top10: LeaderboardRow[] = demoNames.map((name, i) => ({
    rank: i + 1,
    id: `demo-${i}`,
    username: name.toLowerCase(),
    full_name: name,
    total_xp: 4200 - i * 310,
    total_correct_answers: 420 - i * 25,
    total_questions_answered: 500 - i * 25,
    last_active_at: new Date().toISOString(),
    highest_badge: i < 3 ? 'streak_30' : i < 6 ? 'streak_14' : null,
  }));
  const me: LeaderboardRow = {
    rank: 11,
    id: 'demo-me',
    username: 'you',
    full_name: 'You',
    total_xp: 1200,
    total_correct_answers: 120,
    total_questions_answered: 150,
    last_active_at: new Date().toISOString(),
    highest_badge: 'streak_7',
  };
  return { top10, me };
}

export default function LeaderboardPage() {
  const displayName = useDisplayName();
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Demo mode uses localStorage auth, not a real Supabase
      // session — the API route would 401. Matches the same
      // client-side short-circuit dashboard/page.tsx uses for
      // /api/student/stats.
      if (isDemoMode()) {
        if (!cancelled) {
          setData(getDemoLeaderboardPayload());
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/student/leaderboard', { credentials: 'include' });
        if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
        const json = (await res.json()) as LeaderboardPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Could not load the leaderboard right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canvasBg = {
    width: 1280,
    margin: '0 auto',
    position: 'relative' as const,
    background:
      'radial-gradient(900px 520px at 88% -6%, rgba(0,166,166,0.3), transparent 60%),' +
      'radial-gradient(760px 520px at 6% 42%, rgba(88,28,235,0.18), transparent 55%),' +
      'var(--bg)',
    paddingBottom: 60,
  };

  const dotTexture = {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
    backgroundSize: '26px 26px',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  };

  const isMeInTop10 = !!data?.me && data.top10.some((r) => r.id === data.me!.id);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={canvasBg}>
        <div aria-hidden style={dotTexture} />

        <StudentNavbar activeLabel="Leaderboard" />

        <div style={{ maxWidth: 760, margin: '0 auto', padding: '44px 34px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
            Leaderboard
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', margin: '6px 0 4px' }}>
            Top students this term
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            Ranked by XP — points for every correct answer, with a bonus for high-accuracy sessions.
            {isDemoMode() ? ' (demo data)' : ''}
          </p>

          <div
            style={{
              marginTop: 28,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: '20px 24px',
            }}
          >
            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading leaderboard…</div>
            ) : error ? (
              <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>
            ) : !data || data.top10.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                No ranked students yet — be the first to take a challenge.
              </div>
            ) : (
              <LeaderboardList rows={data.top10} meId={data.me?.id} displayName={displayName} />
            )}
          </div>

          {!loading && !error && data?.me && !isMeInTop10 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>
                Your rank
              </div>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--accent-text)',
                  borderRadius: 16,
                  padding: '16px 24px',
                }}
              >
                <LeaderboardList rows={[data.me]} meId={data.me.id} displayName={displayName} />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function LeaderboardList({
  rows,
  meId,
  displayName,
}: {
  rows: LeaderboardRow[];
  meId: string | undefined;
  displayName: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row, i) => {
        const isMe = row.id === meId;
        const accuracy =
          row.total_questions_answered > 0
            ? Math.round((row.total_correct_answers / row.total_questions_answered) * 100)
            : 0;
        const name = isMe ? displayName || row.full_name || 'You' : row.full_name ?? row.username ?? 'Student';
        const initials = name
          .split(/\s+/)
          .map((n) => n[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase();

        return (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr auto auto',
              alignItems: 'center',
              gap: 16,
              padding: '13px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              background: isMe ? 'var(--fill)' : 'transparent',
              borderRadius: isMe ? 10 : 0,
              paddingLeft: isMe ? 10 : 0,
              paddingRight: isMe ? 10 : 0,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: row.rank <= 3 ? 'var(--accent-text)' : 'var(--text3)' }}>
              #{row.rank}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                  color: '#F7F9FA',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {initials || '?'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                  {isMe && <span style={{ color: 'var(--text3)', fontWeight: 500 }}> (you)</span>}
                </div>
                {row.highest_badge && BADGE_LABEL[row.highest_badge] && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {BADGE_LABEL[row.highest_badge]}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
              {row.total_xp.toLocaleString()} XP
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                minWidth: 42,
                textAlign: 'right',
                color: accuracy >= 80 ? '#10B981' : accuracy >= 60 ? '#F97316' : '#8B98A6',
              }}
            >
              {accuracy}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
