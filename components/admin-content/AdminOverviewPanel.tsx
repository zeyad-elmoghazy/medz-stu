'use client';

import type { AdminOverview } from '@/lib/admin-content-api';

type Props = {
  overview: AdminOverview | null;
  onGoUpload: () => void;
  onGoReview: () => void;
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

function actionIcon(action: string): { icon: string; bg: string; color: string } {
  if (action.startsWith('question_published') || action.startsWith('bulk_publish'))
    return { icon: '📤', bg: 'rgba(16,185,129,0.15)', color: '#10B981' };
  if (action.startsWith('question_') || action.startsWith('bulk_'))
    return { icon: '📝', bg: 'rgba(124,58,237,0.15)', color: '#8B5CF6' };
  if (action.startsWith('user_')) return { icon: '👤', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' };
  if (action.startsWith('module_') || action.startsWith('subject_') || action.startsWith('chapter_'))
    return { icon: '🗂️', bg: 'rgba(14,165,233,0.15)', color: '#0EA5E9' };
  if (action === 'content_uploaded') return { icon: '📄', bg: 'rgba(249,115,22,0.15)', color: '#F97316' };
  return { icon: '•', bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' };
}

export function AdminOverviewPanel({ overview, onGoUpload, onGoReview }: Props) {
  const skeleton = overview === null;
  const q = overview?.counts.questions;

  const kpis = [
    { label: 'Students', value: overview?.counts.students ?? 0, color: '#F8FAFC' },
    { label: 'Admins', value: overview?.counts.admins ?? 0, color: '#F8FAFC' },
    { label: 'Modules', value: overview?.counts.modules ?? 0, color: '#F8FAFC' },
    { label: 'Subjects', value: overview?.counts.subjects ?? 0, color: '#F8FAFC' },
    { label: 'Chapters', value: overview?.counts.chapters ?? 0, color: '#F8FAFC' },
  ];

  const questionKpis = q
    ? [
        { label: 'Published', value: q.published, color: '#10B981' },
        { label: 'Under Review', value: q.under_review, color: '#0EA5E9' },
        { label: 'Draft', value: q.draft, color: '#94A3B8' },
        { label: 'Archived', value: q.archived, color: '#EF4444' },
      ]
    : [];

  const dauTrend = overview?.dauTrend ?? [];
  const maxDau = Math.max(1, ...dauTrend.map((d) => d.activeStudents));

  const activity = overview?.recentActivity ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Platform KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={CARD}>
            <div style={KPI_LABEL}>{k.label}</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                marginTop: 8,
                letterSpacing: '-0.02em',
                color: k.color,
                opacity: skeleton ? 0.35 : 1,
              }}
            >
              {skeleton ? '—' : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Question status breakdown + CTAs */}
      <div style={{ ...CARD, padding: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Question bank</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
              {q ? `${q.total} question${q.total === 1 ? '' : 's'} total` : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onGoUpload} style={ghostBtn}>
              + Upload content
            </button>
            <button type="button" onClick={onGoReview} style={primaryBtn}>
              Open review queue →
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {questionKpis.map((k) => (
            <div
              key={k.label}
              style={{
                padding: 16,
                borderRadius: 12,
                background: '#0F0F1A',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: k.color }}>
                {k.value}
              </div>
            </div>
          ))}
          {!q &&
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, opacity: 0.35 }}>—</div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 22, alignItems: 'start' }}>
        {/* DAU trend */}
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Daily active students</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 18 }}>Last 14 days</div>
          {dauTrend.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748B' }}>
              No completed sessions in the last 14 days yet.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {dauTrend.map((d) => (
                <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    title={`${d.date}: ${d.activeStudents}`}
                    style={{
                      height: Math.max(4, (d.activeStudents / maxDau) * 96),
                      background: 'linear-gradient(180deg,#8B5CF6,#7C3AED)',
                      borderRadius: 4,
                      marginBottom: 6,
                    }}
                  />
                  <div style={{ fontSize: 9, color: '#64748B' }}>{d.date.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity — activity_log feed */}
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activity.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Nothing logged yet. Every publish, edit, or upload will show up here.
              </div>
            )}
            {activity.slice(0, 8).map((a) => {
              const meta = actionIcon(a.action);
              const who = a.profiles?.full_name ?? a.profiles?.email ?? 'System';
              return (
                <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
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
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>{a.summary}</div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      {who} · {relativeTime(a.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: '#94A3B8',
  border: '1px solid rgba(255,255,255,0.12)',
  padding: '9px 14px',
  borderRadius: 9,
  cursor: 'pointer',
  background: 'transparent',
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: '#fff',
  border: 'none',
  padding: '9px 14px',
  borderRadius: 9,
  cursor: 'pointer',
  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  fontFamily: 'inherit',
};
