'use client';

import type { ProfessorStats } from '@/lib/professor-api';

type Props = {
  stats: ProfessorStats | null;
  firstName: string;
  onGoUpload: () => void;
  onGoBank: () => void;
  onGoRoster: () => void;
};

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 20,
};

const KPI_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: '#94A3B8',
  fontWeight: 500,
};

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function accuracyColor(a: number): string {
  if (a >= 80) return '#10B981';
  if (a >= 60) return '#F97316';
  return '#EF4444';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

function activityIcon(kind: string): { icon: string; bg: string; color: string } {
  if (kind === 'session') return { icon: '✓', bg: 'rgba(16,185,129,0.15)', color: '#10B981' };
  if (kind === 'publish') return { icon: '📤', bg: 'rgba(124,58,237,0.15)', color: '#8B5CF6' };
  if (kind === 'flag') return { icon: '⚑', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' };
  return { icon: '•', bg: 'rgba(14,165,233,0.15)', color: '#0EA5E9' };
}

export function ProfessorOverview({
  stats,
  firstName,
  onGoUpload,
  onGoBank,
  onGoRoster,
}: Props) {
  const skeleton = stats === null;

  const kpis = [
    {
      label: 'My Students',
      value: stats?.my_students ?? 0,
      color: '#F8FAFC',
      sub: 'Have completed sessions in your subjects',
    },
    {
      label: 'Published Questions',
      value: stats?.published_questions ?? 0,
      color: '#F8FAFC',
      sub: 'Across all chapters you own',
    },
    {
      label: 'Avg. Class Accuracy',
      value:
        stats && stats.total_attempts > 0
          ? `${stats.avg_accuracy}%`
          : '—',
      color:
        stats && stats.avg_accuracy >= 80
          ? '#10B981'
          : stats && stats.avg_accuracy >= 60
            ? '#F97316'
            : stats && stats.total_attempts > 0
              ? '#EF4444'
              : '#F8FAFC',
      sub: 'All completed sessions',
    },
    {
      label: 'Sessions This Week',
      value: stats?.sessions_this_week ?? 0,
      color: '#8B5CF6',
      sub: 'Challenges completed',
    },
  ];

  const attention: {
    icon: string;
    bg: string;
    color: string;
    border: string;
    title: string;
    sub: string;
    cta: string;
    onClick: () => void;
  }[] = [];

  if (stats && stats.draft_questions > 0) {
    attention.push({
      icon: '✨',
      bg: 'rgba(14,165,233,0.15)',
      color: '#0EA5E9',
      border: 'rgba(14,165,233,0.4)',
      title: `${stats.draft_questions} draft question${stats.draft_questions === 1 ? '' : 's'} awaiting publish`,
      sub: 'Open the Question Bank to review and publish',
      cta: 'Review',
      onClick: onGoBank,
    });
  }
  if (stats && stats.flagged_questions > 0) {
    attention.push({
      icon: '⚑',
      bg: 'rgba(239,68,68,0.15)',
      color: '#EF4444',
      border: 'rgba(239,68,68,0.4)',
      title: `${stats.flagged_questions} question${stats.flagged_questions === 1 ? '' : 's'} flagged as confusing`,
      sub: 'Students report ambiguity — worth another look',
      cta: 'View',
      onClick: onGoBank,
    });
  }
  if (stats && stats.under_review > 0) {
    attention.push({
      icon: '🕓',
      bg: 'rgba(124,58,237,0.15)',
      color: '#8B5CF6',
      border: 'rgba(124,58,237,0.4)',
      title: `${stats.under_review} question${stats.under_review === 1 ? '' : 's'} under review`,
      sub: 'Approve or send back for edits',
      cta: 'Open',
      onClick: onGoBank,
    });
  }

  const activityItems = stats?.recent_activity ?? [];
  const chapterPerf = (stats?.chapter_performance ?? [])
    .slice()
    .sort((a, b) => a.avg_accuracy - b.avg_accuracy)
    .slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Personalised banner */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 22,
          border: '1px solid rgba(124,58,237,0.35)',
          background:
            'radial-gradient(1000px 360px at 84% -20%, rgba(124,58,237,0.3), transparent 60%), linear-gradient(150deg,#140f26 0%,#0F0F1A 62%)',
          padding: '26px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 'none' }}>
            <div
              style={{
                position: 'absolute',
                inset: '-6px',
                borderRadius: 20,
                background:
                  'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(139,92,246,0.12))',
                filter: 'blur(12px)',
              }}
            />
            <div
              style={{
                position: 'relative',
                width: 96,
                height: 96,
                borderRadius: 18,
                overflow: 'hidden',
                border: '1px solid rgba(124,58,237,0.5)',
                background:
                  'linear-gradient(135deg,#7C3AED 0%,#1E1B4B 100%)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 32,
                color: '#fff',
              }}
            >
              {firstName.slice(0, 1).toUpperCase()}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{todayLabel()}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em' }}>
              {greetingForHour()}, Dr. {firstName}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94A3B8', maxWidth: 520 }}>
              {stats && stats.my_students > 0
                ? `${stats.my_students} student${stats.my_students === 1 ? '' : 's'} have taken challenges in your subjects.`
                : 'Publish your first questions to start reaching students.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 26, flex: 'none', paddingLeft: 8 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>
                {stats?.sessions_this_week ?? 0}
                <span style={{ fontSize: 14, color: '#F97316' }}> 🔥</span>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                Sessions this week
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={CARD}>
            <div style={KPI_LABEL}>{k.label}</div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                marginTop: 8,
                letterSpacing: '-0.02em',
                color: k.color,
                opacity: skeleton ? 0.35 : 1,
              }}
            >
              {skeleton ? '—' : k.value}
            </div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 22, alignItems: 'start' }}>
        {/* Needs attention */}
        <div style={{ ...CARD, padding: 22 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>Needs your attention</div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#F97316',
                background: 'rgba(249,115,22,0.12)',
                padding: '4px 10px',
                borderRadius: 6,
              }}
            >
              {attention.length} item{attention.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {attention.length === 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: '#64748B',
                  padding: '14px 16px',
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                }}
              >
                All clear. Nothing waiting for you right now.
              </div>
            )}
            {attention.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    flex: 'none',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 16,
                    background: a.bg,
                    color: a.color,
                  }}
                >
                  {a.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{a.sub}</div>
                </div>
                <button
                  type="button"
                  onClick={a.onClick}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: a.color,
                    border: `1px solid ${a.border}`,
                    padding: '8px 14px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flex: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                  }}
                >
                  {a.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activityItems.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748B' }}>
                No activity yet. Once students start taking sessions, they'll appear here.
              </div>
            )}
            {activityItems.slice(0, 5).map((a, i) => {
              const meta = activityIcon(a.kind);
              return (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      flex: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      background: meta.bg,
                      color: meta.color,
                    }}
                  >
                    {meta.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {a.actor ?? 'A student'} scored {Math.round(a.accuracy)}% on{' '}
                      <span style={{ color: '#C4B5FD', textTransform: 'capitalize' }}>{a.subject}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      {relativeTime(a.at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chapter performance */}
      <div style={{ ...CARD, padding: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              How your chapters are performing
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
              Average class accuracy per chapter — the lowest are where students struggle most
            </div>
          </div>
          <button
            type="button"
            onClick={onGoBank}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: '#8B5CF6',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            Open Question Bank →
          </button>
        </div>

        {chapterPerf.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748B' }}>
            No chapter data yet. Publish some questions and wait for student sessions to see this
            fill in.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 40px' }}>
            {chapterPerf.map((c) => {
              const color = accuracyColor(c.avg_accuracy);
              return (
                <div key={c.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 7,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color, fontWeight: 700 }}>{c.avg_accuracy}%</span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, c.avg_accuracy))}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roster CTA */}
      <button
        type="button"
        onClick={onGoRoster}
        style={{
          alignSelf: 'flex-start',
          fontSize: 12,
          color: '#94A3B8',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        See student roster →
      </button>

      {/* Upload CTA — subtle repeat, since design leads with it */}
      <button
        type="button"
        onClick={onGoUpload}
        style={{ display: 'none' }}
      >
        Upload
      </button>
    </div>
  );
}
