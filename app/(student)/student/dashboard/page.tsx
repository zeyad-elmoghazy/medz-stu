'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { SpinnerIcon } from '@/components/icons';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { getSubjectImage } from '@/lib/subject-images';
import { isDemoMode } from '@/lib/supabase';
import { useDisplayName } from '@/lib/use-display-name';
import {
  getEmptyStudentStats,
  type ChallengeResult,
  type FocusArea,
  type ProgressDataPoint,
  type StudentStats,
} from '@/lib/dashboard-data';
import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import { fetchCatalogueStats, type CatalogueStats } from '@/lib/catalogue-stats';
import { fetchModulesByYear, type ModulesByYear } from '@/lib/catalogue-api';

// =============================================================
// Page
// =============================================================

export default function StudentDashboardPage() {
  return (
    <Suspense fallback={null}>
      <StudentDashboardInner />
    </Suspense>
  );
}

function StudentDashboardInner() {
  const searchParams = useSearchParams();

  const initialView = searchParams.get('view') === 'analytics' ? 'analytics' : 'home';
  const [view, setView] = useState<'home' | 'analytics'>(initialView);
  const displayName = useDisplayName();
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // StudentNavbar's "My Progress" / "Home" links navigate to this same
  // route with a different ?view= query param rather than flipping
  // local state directly (that's what the private Navbar this
  // replaced used to do). Since it's the same route, Next keeps this
  // component mounted across that navigation — useState's initialView
  // only applies on the first render — so without this, clicking
  // those links while already on the dashboard wouldn't change what's
  // shown. This keeps view in sync with the URL on every navigation;
  // the in-page onViewAnalytics/onBackToSubjects callbacks below still
  // flip it directly without touching the URL, same as before.
  useEffect(() => {
    setView(searchParams.get('view') === 'analytics' ? 'analytics' : 'home');
  }, [searchParams]);

  // Fetch per-student stats from /api/student/stats. In demo mode
  // the API needs a real Supabase session, so we short-circuit to
  // an empty shape (the UI still paints with zeros and empty
  // states — no fake numbers).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        if (!cancelled) {
          setStats(getEmptyStudentStats());
          setStatsLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/student/stats', {
          credentials: 'include',
          // Let the browser reuse the server's `Cache-Control: private,
          // max-age=60` response so a quick dashboard → analytics →
          // dashboard round-trip skips the API call.
        });
        if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`);
        const json = (await res.json()) as StudentStats;
        if (!cancelled) setStats(json);
      } catch {
        // Network failure or 401 — fall back to the empty shape so
        // the dashboard still paints instead of exploding.
        if (!cancelled) setStats(getEmptyStudentStats());
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canvasBg: CSSProperties = {
    maxWidth: 1280,
    width: '100%',
    margin: '0 auto',
    position: 'relative',
    background: 'var(--bg)',
    paddingBottom: 2,
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 900px) {
              .mz-dash-hero { grid-template-columns: 1fr !important; }
              .mz-dash-kpis { grid-template-columns: repeat(2,1fr) !important; }
              .mz-dash-trend { grid-template-columns: 1fr !important; }
              .mz-dash-modules { grid-template-columns: repeat(auto-fit,minmax(200px,1fr)) !important; }
            }
          `,
        }}
      />
      <div style={canvasBg}>
        <StudentNavbar activeLabel={view === 'home' ? 'Home' : undefined} />

        {view === 'home' ? (
          <HomeView
            firstName={firstName}
            onViewAnalytics={() => setView('analytics')}
          />
        ) : (
          <AnalyticsView
            firstName={firstName || 'there'}
            stats={stats}
            loading={statsLoading}
            onBackToSubjects={() => setView('home')}
          />
        )}
      </div>
    </main>
  );
}

// =============================================================
// HOME VIEW — hero + subjects grid + features
// =============================================================

function HomeView({
  onViewAnalytics,
}: {
  firstName: string;
  onViewAnalytics: () => void;
}) {
  const [catalogueStats, setCatalogueStats] = useState<CatalogueStats | null>(null);
  const [modulesByYear, setModulesByYear] = useState<ModulesByYear | null>(null);
  const heroPhoto = getSubjectImage('anatomy');

  useEffect(() => {
    let cancelled = false;
    fetchCatalogueStats().then((s) => {
      if (!cancelled) setCatalogueStats(s);
    });
    fetchModulesByYear()
      .then((d) => {
        if (!cancelled) setModulesByYear(d);
      })
      .catch(() => {
        /* leave modulesByYear null — the section below handles it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* ================= HERO ================= */}
      <section
        className="mz-dash-hero"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '420px 1fr',
          gap: 56,
          alignItems: 'center',
          padding: '54px 44px 40px',
        }}
      >
        {/* Real product visual: the live Anatomy subject photo, not
            a decorative brand mark — the brief's "product is the
            centerpiece" principle. */}
        <div
          style={{
            position: 'relative',
            height: 380,
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid var(--line)',
          }}
        >
          {heroPhoto && (
            <Image src={heroPhoto} alt="Anatomy" fill sizes="420px" style={{ objectFit: 'cover' }} />
          )}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 14,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text)',
              background: 'var(--nav-bg)',
              border: '1px solid var(--line2)',
              padding: '7px 12px',
              borderRadius: 8,
            }}
          >
            MCQ Bank
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 20 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--accent-text)',
                textTransform: 'uppercase',
                border: '1px solid var(--line2)',
                padding: '6px 12px',
                borderRadius: 7,
              }}
            >
              Exclusive on MediZee
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              color: 'var(--text)',
            }}
          >
            Master Your Curriculum, <span style={{ color: 'var(--accent-text)' }}>Chapter by Chapter</span>
          </h1>

          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 14,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}
          >
            The Full MediZee Curriculum Catalogue
          </div>

          <p
            style={{
              fontSize: 15,
              color: 'var(--text3)',
              margin: '16px 0 0',
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            Every module and chapter organized the way your program teaches it: high-yield questions, detailed explanations, and visual references, publishing chapter by chapter.
          </p>

          {/* Micro-stat row — real structural counts, not a single
              headline number. Published-question count is shown
              smaller and explicitly labeled rather than implying
              the whole bank is live. */}
          <div style={{ display: 'flex', gap: 30, alignItems: 'center', margin: '30px 0 34px' }}>
            <StatMicro
              value={catalogueStats ? String(catalogueStats.moduleCount) : '—'}
              label={<>Modules</>}
              big
            />
            <Divider />
            <StatMicro
              value={catalogueStats ? String(catalogueStats.chapterCount) : '—'}
              label={<>Chapters</>}
              big
            />
            <Divider />
            <StatMicro
              value={catalogueStats ? String(catalogueStats.publishedQuestionCount) : '—'}
              label={<>Published<br />so far</>}
            />
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/student/catalogue"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 15,
                fontWeight: 700,
                color: '#F7F9FA',
                background: 'var(--accent-text)',
                padding: '16px 32px',
                borderRadius: 13,
                cursor: 'pointer',
                border: 'none',
                textDecoration: 'none',
              }}
            >
              Browse the Catalogue <span style={{ fontSize: 17 }}>→</span>
            </Link>

            <button
              type="button"
              onClick={onViewAnalytics}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--accent-text)',
                background: 'var(--line2)',
                border: '1px solid var(--line2)',
                padding: '16px 28px',
                borderRadius: 13,
                cursor: 'pointer',
              }}
            >
              View My Analytics
            </button>
          </div>
        </div>
      </section>

      {/* ================= CATALOGUE ================= */}
      <section style={{ position: 'relative', padding: '34px 44px 30px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Browse the Catalogue
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            {catalogueStats
              ? `${catalogueStats.moduleCount} modules · ${catalogueStats.chapterCount} chapters across your curriculum. Spinal Cord (Anatomy) is the only chapter published so far; the rest are publishing over time.`
              : 'Loading…'}
          </div>
        </div>

        {modulesByYear ? (
          <div
            className="mz-dash-modules"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${modulesByYear.years.length || 1}, 1fr)`,
              gap: 16,
            }}
          >
            {modulesByYear.years.map((y) => (
              <YearCard key={y.year} year={y} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: 40 }}>
            <SpinnerIcon size={16} className="animate-spin" />
            Loading catalogue…
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            href="/student/catalogue"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent-text)',
              background: 'var(--line2)',
              border: '1px solid var(--line2)',
              padding: '12px 22px',
              borderRadius: 11,
              textDecoration: 'none',
            }}
          >
            View full Catalogue →
          </Link>
        </div>
      </section>

      <div style={{ height: 40 }} />
    </>
  );
}

// =============================================================
// ANALYTICS VIEW — KPIs + accuracy trend + focus areas + recent
// =============================================================

function AnalyticsView({
  firstName,
  stats,
  loading,
  onBackToSubjects,
}: {
  firstName: string;
  stats: StudentStats | null;
  loading: boolean;
  onBackToSubjects: () => void;
}) {
  const router = useRouter();
  const empty = getEmptyStudentStats();
  const s = stats ?? empty;

  const totalMistakes = s.mistakes.reduce((sum, m) => sum + m.questionIds.length, 0);

  function practiceChapterMistakes(chapterId: string, questionIds: number[]) {
    if (questionIds.length === 0) return;
    useChapterQuizStore.getState().startMistakeSession(chapterId, questionIds);
    router.push(`/student/quiz/chapter/${chapterId}`);
  }

  // Compose KPI tiles from real per-student numbers. Formatting is
  // done here (not on the API) so the source-of-truth values on
  // the wire stay unambiguous numeric types.
  const kpis: Array<{
    label: string;
    value: string;
    suffix?: string;
    hint: string;
    color: string;
  }> = [
    {
      label: 'Total Questions',
      value: loading ? '—' : s.totalQuestionsAnswered.toLocaleString(),
      hint: 'Across all sessions',
      color: 'var(--text)',
    },
    {
      label: 'Correct Answers',
      value: loading ? '—' : s.totalCorrectAnswers.toLocaleString(),
      hint: 'Cumulative correct',
      color: 'var(--success)',
    },
    {
      label: 'Overall Accuracy',
      value: loading ? '—' : s.overallAccuracy.toFixed(1),
      suffix: loading ? '' : '%',
      hint: 'Weighted mean',
      color: 'var(--text)',
    },
    {
      label: 'Study Streak',
      value: loading ? '—' : String(s.streakDays),
      suffix: loading ? '' : ' 🔥',
      hint: 'Consecutive days',
      color: '#F97316',
    },
    {
      label: 'Bookmarked Questions',
      value: loading ? '—' : s.bookmarksCount.toLocaleString(),
      hint: 'View saved questions & notes',
      color: 'var(--accent-text)',
    },
  ];

  return (
    <section
      style={{
        position: 'relative',
        padding: '40px 44px 54px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)', letterSpacing: '0.03em', marginBottom: 6 }}>
            Student Analytics
          </div>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text)' }}>
            Your Progress, {firstName}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text3)' }}>
            Every metric below is drawn from your completed challenges.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToSubjects}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--accent-text)',
            border: '1px solid var(--line2)',
            padding: '10px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            background: 'transparent',
          }}
        >
          ← Back to Subjects
        </button>
      </div>

      {/* Practice mistakes — real, chapter-quiz-backed mistake pool
          (lib/server/chapter-mistakes.ts). Appears once the student
          has any outstanding wrong answer in any chapter. */}
      {totalMistakes > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '16px 20px',
            background: 'var(--fill)',
            border: '1px solid var(--line2)',
            borderRadius: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              You have {totalMistakes} question{totalMistakes === 1 ? '' : 's'} to review across{' '}
              {s.mistakes.length} chapter{s.mistakes.length === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
              Practice the ones you got wrong — spaced review sticks longest.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.mistakes.map((m) => (
              <div
                key={m.chapterId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {m.chapterName}
                  {m.moduleCode && <span style={{ color: 'var(--text3)' }}> · {m.moduleCode}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => practiceChapterMistakes(m.chapterId, m.questionIds)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#F7F9FA',
                    background: 'var(--accent-text)',
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  Practice {m.questionIds.length}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="mz-dash-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
        {kpis.map((k) => {
          const clickable = k.label === 'Bookmarked Questions';
          return (
            <div
              key={k.label}
              onClick={clickable ? () => router.push('/student/bookmarks') : undefined}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: 20,
                cursor: clickable ? 'pointer' : undefined,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{k.label}</div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  marginTop: 8,
                  letterSpacing: '-0.02em',
                  color: k.color,
                }}
              >
                {k.value}
                {k.suffix && (
                  <span style={{ fontSize: 16, color: 'var(--text3)', fontWeight: 700 }}>{k.suffix}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{k.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Trend + Focus areas */}
      <div className="mz-dash-trend" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22, alignItems: 'start' }}>
        <AccuracyTrend history={s.progressHistory} loading={loading} />
        <FocusAreas focusAreas={s.focusAreas} loading={loading} />
      </div>

      {/* Recent challenges */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Recent Challenges</div>
        <RecentChallenges challenges={s.recentChallenges} loading={loading} />
      </div>
    </section>
  );
}

// =============================================================
// AnalyticsView children — one component per card so the fetch
// state + empty state stay local to what they gate.
// =============================================================

function AccuracyTrend({ history, loading }: { history: ProgressDataPoint[]; loading: boolean }) {
  // Build the polyline path from real accuracy points. Fixed viewBox
  // width 640, height 200, top/bottom padding 12px so the line
  // doesn't clip against the frame at 0%/100%.
  const W = 640;
  const H = 200;
  const PAD_Y = 12;

  const path = (() => {
    if (history.length < 2) return null;
    const usable = H - 2 * PAD_Y;
    const stepX = W / (history.length - 1);
    return history
      .map((p, i) => {
        const x = i * stepX;
        // accuracy is 0..100, invert to SVG coords (0 is top).
        const y = PAD_Y + (1 - Math.max(0, Math.min(100, p.accuracy)) / 100) * usable;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  })();

  const areaPath = path ? `${path} L${W},${H} L0,${H} Z` : null;

  // Compute the header delta from the first and last progress
  // points. Positive → green, negative → red, no data → blank.
  const delta = history.length >= 2
    ? Number((history[history.length - 1].accuracy - history[0].accuracy).toFixed(1))
    : null;

  const firstLabel = history[0]?.date ?? '';
  const lastLabel = history[history.length - 1]?.date ?? '';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Accuracy Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Last 30 days</div>
        </div>
        {delta !== null && (
          <div
            style={{
              fontSize: 11,
              color: delta >= 0 ? 'var(--success)' : 'var(--error)',
              fontWeight: 600,
              background: delta >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </div>
        )}
      </div>

      {path ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }} preserveAspectRatio="none">
            <defs>
              <linearGradient id="homeArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-text)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--accent-text)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="50" x2={W} y2="50" stroke="var(--fill)" />
            <line x1="0" y1="100" x2={W} y2="100" stroke="var(--fill)" />
            <line x1="0" y1="150" x2={W} y2="150" stroke="var(--fill)" />
            {areaPath && <path d={areaPath} fill="url(#homeArea)" />}
            <path d={path} fill="none" stroke="var(--accent-text)" strokeWidth="2.5" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
            <span>{firstLabel}</span>
            <span>{lastLabel}</span>
          </div>
        </>
      ) : (
        <div
          style={{
            height: 200,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            color: 'var(--text3)',
            textAlign: 'center',
            padding: '0 20px',
            lineHeight: 1.5,
          }}
        >
          {loading
            ? 'Loading your accuracy trend…'
            : 'Take at least two histology quizzes to see your accuracy trend.'}
        </div>
      )}
    </div>
  );
}

function FocusAreas({ focusAreas, loading }: { focusAreas: FocusArea[]; loading: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Focus Areas</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, marginBottom: 16 }}>
        Weakest topics — review before exam
      </div>
      {focusAreas.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {focusAreas.map((f) => (
            <div key={f.topic}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{f.topic}</span>
                <span style={{ color: f.accuracy < 60 ? 'var(--error)' : '#F97316' }}>{f.accuracy.toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', marginTop: 6 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(4, f.accuracy)}%`,
                    borderRadius: 3,
                    background: f.accuracy < 60 ? 'var(--error)' : '#F97316',
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                {f.attempted} question{f.attempted === 1 ? '' : 's'} attempted
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            minHeight: 148,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            color: 'var(--text3)',
            textAlign: 'center',
            padding: '0 8px',
            lineHeight: 1.5,
          }}
        >
          {loading
            ? 'Loading your focus areas…'
            : 'Answer at least 3 questions in a topic to see it here.'}
        </div>
      )}
    </div>
  );
}

function RecentChallenges({ challenges, loading }: { challenges: ChallengeResult[]; loading: boolean }) {
  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading recent challenges…</div>;
  }
  if (challenges.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        No completed challenges yet — take a histology quiz to see it here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {challenges.map((c) => {
        const pct = Math.round(c.accuracy);
        const { color, tag, tagBg } = challengeTone(pct);
        return (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              alignItems: 'center',
              gap: 20,
              padding: '13px 0',
              borderTop: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.subjectName}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{relativeTime(c.completedAt)}</div>
            </div>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: 'var(--text3)' }}>
              {c.score} / {c.total}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, minWidth: 52, textAlign: 'right', color }}>{pct}%</div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color,
                background: tagBg,
                padding: '4px 9px',
                borderRadius: 6,
              }}
            >
              {tag}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Threshold table for the accuracy pill. Matches the design's
// green / orange / red palette.
function challengeTone(pct: number): { color: string; tag: string; tagBg: string } {
  if (pct >= 80) return { color: 'var(--success)', tag: 'Great',  tagBg: 'rgb(var(--success-rgb) / 0.12)' };
  if (pct >= 60) return { color: '#F97316', tag: 'Review', tagBg: 'rgba(249,115,22,0.12)' };
  return           { color: 'var(--error)', tag: 'Weak',   tagBg: 'rgb(var(--error-rgb) / 0.12)'  };
}

// "Today, 2:14 PM" / "Yesterday" / "3 days ago" — matches the
// old mock's copy pattern so the layout doesn't shift.
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    const h = then.getHours() % 12 || 12;
    const m = then.getMinutes().toString().padStart(2, '0');
    const ampm = then.getHours() >= 12 ? 'PM' : 'AM';
    return `Today, ${h}:${m} ${ampm}`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// =============================================================
// Small helpers
// =============================================================

function StatMicro({
  value,
  icon,
  label,
  big,
}: {
  value?: string;
  icon?: string;
  label: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {value && (
        <span style={{ fontSize: big ? 24 : 19, fontWeight: 900, color: 'var(--accent-text)' }}>
          {value}
        </span>
      )}
      {icon && <span style={{ fontSize: 19 }}>{icon}</span>}
      <span style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 34, background: 'var(--line2)' }} />;
}

function YearCard({ year }: { year: ModulesByYear['years'][number] }) {
  return (
    <Link
      href={`/student/catalogue/${year.year}`}
      style={{
        cursor: 'pointer',
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        padding: 20,
        textDecoration: 'none',
        display: 'block',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--accent-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 800,
          color: '#F7F9FA',
          marginBottom: 14,
        }}
      >
        {year.year}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
        Year {year.year}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>{year.label}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 12 }}>
        {year.moduleCount} modules · {year.chapterCount} chapters
      </div>
    </Link>
  );
}
