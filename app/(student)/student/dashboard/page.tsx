'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogOut, Moon } from 'lucide-react';
import { MediZeeLogo } from '@/components/brand/MediZeeLogo';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';
import {
  getEmptyStudentStats,
  type ChallengeResult,
  type ProgressDataPoint,
  type StudentStats,
} from '@/lib/dashboard-data';
import { useQuizStore } from '@/lib/store';
import { NavToast, useNavToast } from '@/components/ui/NavToast';

// =============================================================
// Static UI copy (not user data — these are visual constants that
// describe the product itself, not the current student).
// =============================================================

type LockedSubject = {
  name: string;
  image: string;         // path under /public
  gradientFrom: string;  // color-coded overlay start — the emoji is gone
  gradientTo: string;    // but the color identity per subject stays
};

// "Coming soon" subject placeholders on the home grid. Not user
// data — this is the marketing catalog. Real per-subject stats
// come from /api/student/stats.subjects. Images live in
// public/subjects/<name>.png.
const LOCKED: LockedSubject[] = [
  { name: 'Anatomy',      image: '/subjects/anatomy.webp',      gradientFrom: 'rgba(59,130,246,0.55)', gradientTo: 'rgba(15,23,42,0.15)' },
  { name: 'Physiology',   image: '/subjects/physiology.webp',   gradientFrom: 'rgba(239,68,68,0.55)',  gradientTo: 'rgba(15,23,42,0.15)' },
  { name: 'Biochemistry', image: '/subjects/biochemistry.webp', gradientFrom: 'rgba(16,185,129,0.55)', gradientTo: 'rgba(15,23,42,0.15)' },
  { name: 'Pathology',    image: '/subjects/pathology.webp',    gradientFrom: 'rgba(236,72,153,0.55)', gradientTo: 'rgba(15,23,42,0.15)' },
  { name: 'Pharmacology', image: '/subjects/pharmacology.webp', gradientFrom: 'rgba(249,115,22,0.55)', gradientTo: 'rgba(15,23,42,0.15)' },
];

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const startSession = useQuizStore((s) => s.startSession);

  const initialView = searchParams.get('view') === 'analytics' ? 'analytics' : 'home';
  const [view, setView] = useState<'home' | 'analytics'>(initialView);
  const [firstName, setFirstName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Populate name from the demo profile (or real Supabase profile).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo?.full_name && !cancelled) {
          setDisplayName(demo.full_name);
          setFirstName(demo.full_name.split(/\s+/)[0] ?? demo.full_name);
        }
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        const profile = data as Pick<Profile, 'full_name'> | null;
        if (!cancelled && profile?.full_name) {
          setDisplayName(profile.full_name);
          setFirstName(profile.full_name.split(/\s+/)[0] ?? profile.full_name);
        }
      } catch {
        /* leave name blank if the profile fetch fails */
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

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

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!isDemoMode()) await supabase.auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  function handleStartHistology() {
    startSession();
    router.push('/student/quiz/histology');
  }

  const toggleView = () => setView((v) => (v === 'home' ? 'analytics' : 'home'));

  // Canvas background — design's radial gradients + dotted texture.
  const canvasBg: CSSProperties = {
    width: 1280,
    margin: '0 auto',
    position: 'relative',
    background:
      'radial-gradient(900px 520px at 88% -6%, rgba(0,166,166,0.3), transparent 60%),' +
      'radial-gradient(760px 520px at 6% 42%, rgba(88,28,235,0.18), transparent 55%),' +
      '#0B1F33',
    paddingBottom: 2,
  };

  const dotTexture: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
    backgroundSize: '26px 26px',
    opacity: 0.5,
    pointerEvents: 'none',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0B1F33', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={canvasBg}>
        <div aria-hidden style={dotTexture} />

        <Navbar
          view={view}
          onToggleView={toggleView}
          userLabel={displayName}
          signingOut={signingOut}
          onLogout={handleLogout}
        />

        {view === 'home' ? (
          <HomeView
            firstName={firstName}
            onStartHistology={handleStartHistology}
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
// Navbar
// =============================================================

const NAV_LINKS: { label: string; href?: string; active?: boolean; toast?: string }[] = [
  { label: 'Home',           active: true },
  { label: 'Catalogue',      href: '/student/catalogue' },
  { label: 'Custom Exam',    href: '/student/exam' },
  { label: 'Flashcards',     toast: 'Coming soon.' },
  { label: 'AI Tutor',       toast: 'Coming soon.' },
  { label: 'Leaderboard' },
];

function Navbar({
  view,
  onToggleView,
  userLabel,
  signingOut,
  onLogout,
}: {
  view: 'home' | 'analytics';
  onToggleView: () => void;
  userLabel: string;
  signingOut: boolean;
  onLogout: () => void;
}) {
  const initials = userLabel
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const { message, showToast } = useNavToast();

  // Sticky header with a subtle background/shadow that fades in once the
  // page has scrolled — same treatment as StudentNavbar.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 4);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 34px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: scrolled ? 'rgba(11,31,51,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(10px)' : 'none',
        boxShadow: scrolled ? '0 4px 20px rgba(0,0,0,0.25)' : '0 0 0 rgba(0,0,0,0)',
        transition: 'background-color 0.25s ease, box-shadow 0.25s ease, backdrop-filter 0.25s ease',
      }}
    >
      <MediZeeLogo size="sm" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}>
        {NAV_LINKS.map((link) => {
          if (link.href) {
            return (
              <Link
                key={link.label}
                href={link.href}
                style={{ color: '#8B98A6', textDecoration: 'none' }}
              >
                {link.label}
              </Link>
            );
          }
          if (link.toast) {
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => showToast(link.toast!)}
                style={{
                  color: '#8B98A6',
                  fontWeight: 500,
                  fontSize: 13.5,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {link.label}
              </button>
            );
          }
          return (
            <span
              key={link.label}
              style={{
                color: link.active ? '#F7F9FA' : '#8B98A6',
                fontWeight: link.active ? 600 : 500,
              }}
            >
              {link.label}
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={onToggleView}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: '#F7F9FA',
            background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
            padding: '9px 16px',
            borderRadius: 10,
            boxShadow: '0 0 18px rgba(0,166,166,0.4)',
            cursor: 'pointer',
            border: 'none',
          }}
        >
          {view === 'home' ? 'My Progress' : '← Home'}
        </button>

        <button
          type="button"
          aria-label="Toggle theme"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8B98A6',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Moon style={{ width: 15, height: 15 }} />
        </button>

        {/* Profile pill → /student/profile (profile & settings). */}
        <Link
          href="/student/profile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#8B98A6',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
              color: '#F7F9FA',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials || 'ME'}
          </span>
          {userLabel}
        </Link>

        <button
          type="button"
          onClick={onLogout}
          disabled={signingOut}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#8B98A6',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {signingOut ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <LogOut style={{ width: 13, height: 13 }} />}
          Log out
        </button>
      </div>
    </nav>
    <NavToast message={message} />
    </>
  );
}

// =============================================================
// HOME VIEW — hero + subjects grid + features
// =============================================================

function HomeView({
  onStartHistology,
  onViewAnalytics,
}: {
  firstName: string;
  onStartHistology: () => void;
  onViewAnalytics: () => void;
}) {
  return (
    <>
      {/* ================= HERO ================= */}
      <section
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '420px 1fr',
          gap: 56,
          alignItems: 'center',
          padding: '54px 44px 40px',
        }}
      >
        {/* MediZee holographic frame — rings + brand mark + orbiting feature chips */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 440,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 360,
              height: 360,
              borderRadius: '50%',
              border: '1px solid rgba(0,166,166,0.25)',
              animation: 'ringSpin 26s linear infinite',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              border: '1px dashed rgba(0,166,166,0.3)',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 380,
              height: 200,
              bottom: 34,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(0,166,166,0.45), transparent 70%)',
              filter: 'blur(18px)',
            }}
          />

          {/* Brand mark at the center */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              width: 220,
              height: 220,
              borderRadius: 28,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(160deg,#132B45,#0B1F33)',
              border: '1px solid rgba(0,166,166,0.5)',
              boxShadow: '0 0 0 1px rgba(0,166,166,0.3), 0 0 60px rgba(0,166,166,0.45)',
            }}
          >
            <Image src="/medizee-logo.webp" alt="MediZee" width={120} height={120} priority style={{ borderRadius: 20 }} />
          </div>

          {/* Feature chips positioned around the mark */}
          {[
            { label: 'MCQ Bank',        top: '10%', left: '4%'  },
            { label: 'Generated Exams', top: '10%', right: '4%' },
            { label: 'Flashcards Soon', bottom: '12%', left: '4%'  },
            { label: 'AI Tutor Soon',   bottom: '12%', right: '4%' },
          ].map((chip) => (
            <div
              key={chip.label}
              style={{
                position: 'absolute',
                zIndex: 3,
                top: chip.top,
                left: chip.left,
                right: chip.right,
                bottom: chip.bottom,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#33BFBF',
                background: 'rgba(13,11,26,0.82)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(0,166,166,0.4)',
                padding: '8px 12px',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {chip.label}
            </div>
          ))}
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 20 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#00A6A6',
                textTransform: 'uppercase',
                border: '1px solid rgba(0,166,166,0.35)',
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
              fontSize: 62,
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              color: '#F7F9FA',
            }}
          >
            Study <span style={{ color: '#00A6A6' }}>Histology</span> Now
          </h1>

          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 14,
              letterSpacing: '-0.01em',
              color: '#F7F9FA',
            }}
          >
            The MediZee Histology Question Bank
          </div>

          <p
            style={{
              fontSize: 15,
              color: '#8B98A6',
              margin: '16px 0 0',
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            High-yield questions, detailed explanations, and visual references — the first live subject in the MediZee bank, with flashcards and an AI tutor on the way.
          </p>

          {/* Micro-stat row */}
          <div style={{ display: 'flex', gap: 30, alignItems: 'center', margin: '30px 0 34px' }}>
            <StatMicro value="450+" label={<>High-Yield<br />Questions</>} big />
            <Divider />
            <StatMicro label={<>Detailed<br />Explanations</>} />
            <Divider />
            <StatMicro label={<>Visual<br />References</>} />
            <Divider />
            <StatMicro label={<>Exam<br />Focused</>} />
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onStartHistology}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 15,
                fontWeight: 700,
                color: '#F7F9FA',
                background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                padding: '16px 32px',
                borderRadius: 13,
                boxShadow: '0 0 30px rgba(0,166,166,0.5)',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              Start Learning Histology <span style={{ fontSize: 17 }}>→</span>
            </button>

            <button
              type="button"
              onClick={onViewAnalytics}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 15,
                fontWeight: 700,
                color: '#33BFBF',
                background: 'rgba(0,166,166,0.1)',
                border: '1px solid rgba(0,166,166,0.45)',
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

      {/* ================= EXPLORE ALL SUBJECTS ================= */}
      <section style={{ position: 'relative', padding: '34px 44px 30px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: '#F7F9FA' }}>
            Explore All Subjects
          </h2>
          <div style={{ fontSize: 13, color: '#8B98A6', marginTop: 8 }}>More subjects coming soon</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.55fr repeat(5, 1fr)',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          {/* Featured: Histology */}
          <div
            style={{
              position: 'relative',
              borderRadius: 18,
              padding: 16,
              background: 'linear-gradient(165deg,#132B45,#0B1F33)',
              animation: 'medzGlow 3.4s ease-in-out infinite',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
            }}
            onClick={onStartHistology}
          >
            <div
              style={{
                position: 'relative',
                height: 190,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(0,166,166,0.3)',
              }}
            >
              <Image
                src="/subjects/histology.webp"
                alt="Histology"
                fill
                sizes="320px"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#F7F9FA' }}>
                Histology
              </div>
              <div style={{ fontSize: 12, color: '#8B98A6', marginTop: 4 }}>Curated by MediZee</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 14,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#33BFBF',
                  border: '1px solid rgba(0,166,166,0.4)',
                  padding: '6px 11px',
                  borderRadius: 8,
                }}
              >
                Exclusive Module
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 18, fontSize: 11.5, color: '#8B98A6' }}>
              <div style={{ fontWeight: 700, color: '#F7F9FA' }}>450+ High-Yield Questions</div>
              <div style={{ color: '#8B98A6', marginTop: 4 }}>
                Detailed Explanations · Visual References · Exam Focused
              </div>
            </div>
          </div>

          {/* Locked subjects */}
          {LOCKED.map((s) => (
            <LockedSubjectCard key={s.name} subject={s} />
          ))}
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
  const mistakeQuestionIds = useQuizStore((s) => s.mistakeQuestionIds);
  const startMistakeSession = useQuizStore((s) => s.startMistakeSession);
  const empty = getEmptyStudentStats();
  const s = stats ?? empty;

  function practiceMistakes() {
    if (mistakeQuestionIds.length === 0) return;
    startMistakeSession(mistakeQuestionIds);
    router.push('/student/quiz/histology?mode=mistakes');
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
      color: '#F7F9FA',
    },
    {
      label: 'Correct Answers',
      value: loading ? '—' : s.totalCorrectAnswers.toLocaleString(),
      hint: 'Cumulative correct',
      color: '#10B981',
    },
    {
      label: 'Overall Accuracy',
      value: loading ? '—' : s.overallAccuracy.toFixed(1),
      suffix: loading ? '' : '%',
      hint: 'Weighted mean',
      color: '#F7F9FA',
    },
    {
      label: 'Study Streak',
      value: loading ? '—' : String(s.streakDays),
      suffix: loading ? '' : ' 🔥',
      hint: 'Consecutive days',
      color: '#F97316',
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
          <div style={{ fontSize: 11, fontWeight: 600, color: '#00A6A6', letterSpacing: '0.03em', marginBottom: 6 }}>
            Student Analytics
          </div>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: '#F7F9FA' }}>
            Your Progress, {firstName}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8B98A6' }}>
            Every metric below is drawn from your completed challenges.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToSubjects}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: '#33BFBF',
            border: '1px solid rgba(0,166,166,0.4)',
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

      {/* Practice mistakes CTA — appears once the student has any
          question in their mistakes pool. */}
      {mistakeQuestionIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(0,166,166,0.16), rgba(0,166,166,0.06))',
            border: '1px solid rgba(0,166,166,0.45)',
            borderRadius: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F7F9FA' }}>
              You have {mistakeQuestionIds.length} question{mistakeQuestionIds.length === 1 ? '' : 's'} to review
            </div>
            <div style={{ fontSize: 12, color: '#8B98A6', marginTop: 3 }}>
              Practice the ones you got wrong — spaced review sticks longest.
            </div>
          </div>
          <button
            type="button"
            onClick={practiceMistakes}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#F7F9FA',
              background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
              padding: '11px 18px',
              borderRadius: 10,
              boxShadow: '0 0 18px rgba(0,166,166,0.4)',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            Practice mistakes
          </button>
        </div>
      )}

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              background: '#132B45',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 11, color: '#8B98A6' }}>{k.label}</div>
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
                <span style={{ fontSize: 16, color: '#8B98A6', fontWeight: 700 }}>{k.suffix}</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#8B98A6', marginTop: 6 }}>{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Trend + Focus areas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22, alignItems: 'start' }}>
        <AccuracyTrend history={s.progressHistory} loading={loading} />
        <FocusAreas />
      </div>

      {/* Recent challenges */}
      <div style={{ background: '#132B45', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#F7F9FA' }}>Recent Challenges</div>
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
    <div style={{ background: '#132B45', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#F7F9FA' }}>Accuracy Trend</div>
          <div style={{ fontSize: 11, color: '#8B98A6', marginTop: 3 }}>Last 30 days</div>
        </div>
        {delta !== null && (
          <div
            style={{
              fontSize: 11,
              color: delta >= 0 ? '#10B981' : '#EF4444',
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
                <stop offset="0%" stopColor="#00A6A6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#00A6A6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="50" x2={W} y2="50" stroke="rgba(255,255,255,0.05)" />
            <line x1="0" y1="100" x2={W} y2="100" stroke="rgba(255,255,255,0.05)" />
            <line x1="0" y1="150" x2={W} y2="150" stroke="rgba(255,255,255,0.05)" />
            {areaPath && <path d={areaPath} fill="url(#homeArea)" />}
            <path d={path} fill="none" stroke="#00A6A6" strokeWidth="2.5" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8B98A6', marginTop: 8 }}>
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
            color: '#8B98A6',
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

function FocusAreas() {
  // Per-topic accuracy isn't in the /api/student/stats response
  // yet — it needs question-level rollups that aren't materialized.
  // Show an honest empty state instead of fabricated weak topics.
  return (
    <div style={{ background: '#132B45', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#F7F9FA' }}>Focus Areas</div>
      <div style={{ fontSize: 11, color: '#8B98A6', marginTop: 3, marginBottom: 16 }}>
        Weakest topics — review before exam
      </div>
      <div
        style={{
          minHeight: 148,
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          color: '#8B98A6',
          textAlign: 'center',
          padding: '0 8px',
          lineHeight: 1.5,
        }}
      >
        Topic-level breakdown will appear here once per-topic accuracy is tracked.
      </div>
    </div>
  );
}

function RecentChallenges({ challenges, loading }: { challenges: ChallengeResult[]; loading: boolean }) {
  if (loading) {
    return <div style={{ fontSize: 12, color: '#8B98A6' }}>Loading recent challenges…</div>;
  }
  if (challenges.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#8B98A6' }}>
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
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F7F9FA' }}>{c.subjectName}</div>
              <div style={{ fontSize: 10, color: '#8B98A6', marginTop: 2 }}>{relativeTime(c.completedAt)}</div>
            </div>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: '#8B98A6' }}>
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
  if (pct >= 80) return { color: '#10B981', tag: 'Great',  tagBg: 'rgba(16,185,129,0.12)' };
  if (pct >= 60) return { color: '#F97316', tag: 'Review', tagBg: 'rgba(249,115,22,0.12)' };
  return           { color: '#EF4444', tag: 'Weak',   tagBg: 'rgba(239,68,68,0.12)'  };
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
        <span style={{ fontSize: big ? 24 : 19, fontWeight: 900, color: '#00A6A6' }}>
          {value}
        </span>
      )}
      {icon && <span style={{ fontSize: 19 }}>{icon}</span>}
      <span style={{ fontSize: 11, color: '#8B98A6', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.12)' }} />;
}

function LockedSubjectCard({ subject }: { subject: LockedSubject }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: '#132B45',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 118,
          borderRadius: 11,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          position: 'relative',
        }}
      >
        <Image
          src={subject.image}
          alt={subject.name}
          fill
          sizes="180px"
          style={{ objectFit: 'cover' }}
        />
        {/* Color-coded overlay preserves each subject's visual
            identity (was the emoji tint) and softens the image
            just enough to signal "coming soon". */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${subject.gradientFrom}, ${subject.gradientTo})`,
            mixBlendMode: 'multiply',
          }}
        />
      </div>
      <div style={{ marginTop: 13, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#F7F9FA' }}>{subject.name}</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8B98A6', letterSpacing: '0.06em' }}>LOCKED</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: '#00A6A6', marginTop: 3 }}>
          Coming Soon
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 10.5, color: '#8B98A6', lineHeight: 1.5 }}>
        High-Yield Questions
        <br />
        Detailed Explanations
      </div>
    </div>
  );
}
