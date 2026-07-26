'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  isDemoMode,
  createBrowserClient,
} from '@/lib/supabase';
import {
  getMockProfessorStudents,
  type StudentRecord,
} from '@/lib/professor-types';
import { Flame, Search, X } from 'lucide-react';

type SortBy = 'name' | 'accuracy' | 'lastActive';

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 24,
};

function accuracyColor(acc: number, hasAttempts: boolean): string {
  if (!hasAttempts) return '#64748B';
  if (acc >= 80) return '#10B981';
  if (acc >= 60) return '#F59E0B';
  return '#EF4444';
}

function relative(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function StudentRosterPanel() {
  const supabase = createBrowserClient();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('accuracy');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        if (!cancelled) {
          setStudents(getMockProfessorStudents());
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/professor/students', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { students: StudentRecord[] };
        if (!cancelled) setStudents(body.students ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setStudents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.totalAnswered > 0);
    const avg =
      active.length === 0
        ? 0
        : Math.round(
            (active.reduce((acc, s) => acc + s.overallAccuracy, 0) / active.length) * 10
          ) / 10;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = students.filter(
      (s) => s.lastActive && new Date(s.lastActive) >= todayStart
    ).length;
    return { total, avg, today };
  }, [students]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? students.filter((s) => s.fullName.toLowerCase().includes(term))
      : students;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
      if (sortBy === 'accuracy') return b.overallAccuracy - a.overallAccuracy;
      const aT = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const bT = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return bT - aT;
    });
    return sorted;
  }, [students, search, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>Total Students</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{stats.total}</div>
        </div>
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>Average Accuracy</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#10B981' }}>
            {stats.total === 0 ? '—' : `${stats.avg}%`}
          </div>
        </div>
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>Active Today</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#F97316' }}>
            {stats.today}
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ ...CARD, padding: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            gap: 10,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>Students</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748B',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="search"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  height: 38,
                  padding: '0 12px 0 36px',
                  borderRadius: 10,
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#F8FAFC',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  width: 220,
                }}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              style={{
                height: 38,
                padding: '0 12px',
                borderRadius: 10,
                background: '#0F0F1A',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#F8FAFC',
                fontSize: 12.5,
                fontFamily: 'inherit',
              }}
            >
              <option value="name">Sort by name</option>
              <option value="accuracy">Sort by accuracy</option>
              <option value="lastActive">Sort by last active</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
            Loading roster…
          </div>
        ) : error ? (
          <div
            style={{
              padding: 30,
              textAlign: 'center',
              color: '#FCA5A5',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: 'center',
              color: '#64748B',
              fontSize: 13,
            }}
          >
            {search ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div>
                  No students match "<span style={{ color: '#F8FAFC' }}>{search}</span>"
                </div>
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#94A3B8',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <X size={12} /> Clear
                </button>
              </div>
            ) : (
              'No students enrolled yet.'
            )}
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                gap: 12,
                padding: '10px 14px',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#64748B',
              }}
            >
              <span>Student</span>
              <span style={{ textAlign: 'center' }}>Challenges</span>
              <span style={{ textAlign: 'center' }}>Accuracy</span>
              <span style={{ textAlign: 'center' }}>Streak</span>
              <span style={{ textAlign: 'center' }}>Last active</span>
            </div>
            {rows.map((s) => {
              const isOpen = expanded === s.id;
              const acColor = accuracyColor(s.overallAccuracy, s.totalAnswered > 0);
              return (
                <div key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 14px',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#fff',
                          flex: 'none',
                        }}
                      >
                        {initials(s.fullName)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.fullName}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#64748B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.email}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: 'center',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        color: '#CBD5E1',
                      }}
                    >
                      {s.challengesCompleted}
                    </div>
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                        color: acColor,
                      }}
                    >
                      {s.totalAnswered === 0 ? '—' : `${s.overallAccuracy}%`}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 12, color: '#CBD5E1' }}>
                      {s.streakDays > 0 ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#F97316',
                          }}
                        >
                          <Flame size={12} /> {s.streakDays}
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#64748B' }}>
                      {relative(s.lastActive)}
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: '4px 14px 18px 60px',
                        background: '#0F0F1A',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                        Per-subject breakdown
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {s.subjects.map((sub) => {
                          const noneYet = sub.sessionsCompleted === 0;
                          return (
                            <div
                              key={sub.subjectId}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '160px 1fr 80px',
                                gap: 12,
                                alignItems: 'center',
                                fontSize: 12,
                              }}
                            >
                              <span style={{ color: '#CBD5E1' }}>{sub.subjectName}</span>
                              <div
                                style={{
                                  height: 6,
                                  background: 'rgba(255,255,255,0.05)',
                                  borderRadius: 3,
                                  overflow: 'hidden',
                                }}
                              >
                                {!noneYet && (
                                  <div
                                    style={{
                                      width: `${Math.min(100, sub.avgAccuracy)}%`,
                                      height: '100%',
                                      background: accuracyColor(sub.avgAccuracy, true),
                                      borderRadius: 3,
                                    }}
                                  />
                                )}
                              </div>
                              <span
                                style={{
                                  textAlign: 'right',
                                  color: noneYet ? '#475569' : accuracyColor(sub.avgAccuracy, true),
                                  fontWeight: 600,
                                }}
                              >
                                {noneYet ? '—' : `${Math.round(sub.avgAccuracy)}%`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
