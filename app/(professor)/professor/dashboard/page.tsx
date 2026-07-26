'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
} from '@/lib/supabase';
import {
  fetchProfessorStats,
  fetchModules,
  type ProfessorStats,
  type ModuleWithChapters,
} from '@/lib/professor-api';
import { HISTOLOGY_ACADEMIC_YEARS } from '@/data/histology-catalog';

// Static catalog → demo fallback when /api/professor/modules
// returns 401 (no DB / no session). ID stability doesn't matter
// here — Post-Lecture and Mock-Exams panels write to localStorage
// keyed by their own uuids.
const DEMO_MODULES: ModuleWithChapters[] = HISTOLOGY_ACADEMIC_YEARS.flatMap((y) =>
  y.modules.map((m) => ({
    code: m.code,
    subject_id: 'histology',
    name: m.name,
    year_num: y.yearNum,
    year_label: y.label,
    is_active: y.yearNum === '1',
    chapters: m.chapters.map((c, i) => ({
      id: `demo-${m.code}-${c.id}`,
      slug: c.id,
      name: c.name,
      ordinal: i + 1,
      question_count: 0,
      published_count: 0,
      flagged_count: 0,
    })),
  }))
);
import { ProfessorOverview } from '@/components/professor/ProfessorOverview';
import { UploadWizard } from '@/components/professor/UploadWizard';
import { QuestionBank } from '@/components/professor/QuestionBank';
import { StudentRosterPanel } from '@/components/professor/StudentRosterPanel';
import { PostLecturePanel } from '@/components/professor/PostLecturePanel';
import { MockExamsPanel } from '@/components/professor/MockExamsPanel';

type View = 'overview' | 'upload' | 'bank' | 'roster' | 'exams' | 'challenges';

type NavDef = { key: View; label: string; badge?: number };

export default function ProfessorDashboardPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<ProfessorStats | null>(null);
  const [modules, setModules] = useState<ModuleWithChapters[]>([]);
  const [professorName, setProfessorName] = useState('Professor');
  const [professorEmail, setProfessorEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const { profile, stats: s } = await fetchProfessorStats();
      setStats(s);
      if (profile.full_name) setProfessorName(profile.full_name);
      if (profile.email) setProfessorEmail(profile.email);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load stats');
    }
  }, []);

  const refreshModules = useCallback(async () => {
    try {
      const { modules: m } = await fetchModules();
      // Real user, empty modules → leave empty (honest). Only
      // demo mode falls back to the static catalog.
      setModules(m.length > 0 ? m : isDemoMode() ? DEMO_MODULES : []);
    } catch {
      setModules(isDemoMode() ? DEMO_MODULES : []);
    }
  }, []);

  // Initial load + 30s polling
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (!cancelled && demo?.full_name) setProfessorName(demo.full_name);
        if (!cancelled && demo?.email) setProfessorEmail(demo.email);
      } else {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', user.id)
              .single();
            const p = data as { full_name: string | null; email: string | null } | null;
            if (!cancelled && p?.full_name) setProfessorName(p.full_name);
            if (!cancelled && p?.email) setProfessorEmail(p.email);
          }
        } catch {
          // best-effort
        }
      }

      await Promise.all([refreshStats(), refreshModules()]);
    })();

    const interval = window.setInterval(() => {
      if (!cancelled) refreshStats();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [supabase, refreshStats, refreshModules]);

  const handleLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!isDemoMode()) {
      await supabase.auth.signOut().catch(() => {});
    }
    router.push('/login');
    router.refresh();
  }, [signingOut, supabase, router]);

  const draftsBadge = stats?.draft_questions ?? 0;
  const reviewBadge = stats?.under_review ?? 0;
  const bankBadge = draftsBadge + reviewBadge;

  const navDef: NavDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'upload', label: 'Upload Content' },
    { key: 'bank', label: 'Question Bank', badge: bankBadge > 0 ? bankBadge : undefined },
    { key: 'roster', label: 'Student Roster' },
    { key: 'exams', label: 'Mock Exams' },
    { key: 'challenges', label: 'Post-Lecture' },
  ];

  const titles: Record<View, [string, string]> = {
    overview: [
      'Overview',
      'A personalised snapshot of your module, your students, and what needs you next.',
    ],
    upload: [
      'Upload Content',
      'Add questions to any chapter — write them yourself or let AI extract them from a document.',
    ],
    bank: [
      'Question Bank',
      'Browse, search, edit, and approve every question in your module.',
    ],
    roster: [
      'Student Roster',
      'See how each enrolled student is performing and drill into their chapters.',
    ],
    exams: [
      'Mock Exams',
      'Create, schedule, and track timed exams for your students.',
    ],
    challenges: [
      'Post-Lecture Challenges',
      'Create short challenges students take right after a lecture — release now or schedule for later.',
    ],
  };

  const firstName = professorName.split(' ').filter(Boolean).pop() ?? 'Professor';
  const initials = professorName
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DR';

  const [pageTitle, pageSubtitle] = titles[view];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#09090E', color: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ============ SIDEBAR ============ */}
      <aside
        style={{
          width: 248,
          flex: 'none',
          background: '#0F0F1A',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 18,
              color: '#fff',
              boxShadow: '0 0 18px rgba(124,58,237,0.5)',
            }}
          >
            M
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
            MedZ{' '}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#8B5CF6',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginLeft: 2,
              }}
            >
              Faculty
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748B',
              padding: '0 10px 8px',
            }}
          >
            Teach
          </div>
          {navDef.map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  borderRadius: 9,
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  color: active ? '#F8FAFC' : '#94A3B8',
                  background: active ? 'rgba(124,58,237,0.14)' : 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: active ? '#8B5CF6' : '#475569',
                    flex: 'none',
                  }}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#0EA5E9',
                      background: 'rgba(14,165,233,0.14)',
                      padding: '2px 7px',
                      borderRadius: 10,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: 12,
            background: '#161B26',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              overflow: 'hidden',
              flex: 'none',
              border: '1px solid rgba(124,58,237,0.5)',
              background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Dr. {firstName}
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#94A3B8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={professorEmail}
            >
              {professorEmail || 'Faculty'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out"
            style={{
              width: 30,
              height: 30,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8',
              cursor: signingOut ? 'not-allowed' : 'pointer',
              opacity: signingOut ? 0.5 : 1,
            }}
          >
            {signingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          </button>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: '28px 40px 64px',
          maxWidth: 1440,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#7C3AED',
                letterSpacing: '0.03em',
                marginBottom: 6,
              }}
            >
              Professor Dashboard
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: '-0.025em',
              }}
            >
              {pageTitle}
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 13,
                color: '#94A3B8',
                maxWidth: 560,
              }}
            >
              {pageSubtitle}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <button
              type="button"
              onClick={() => setView('challenges')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: '#C4B5FD',
                background: 'rgba(124,58,237,0.1)',
                border: '1px solid rgba(139,92,246,0.45)',
                padding: '12px 18px',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 15 }}>🎓</span> Post-Lecture
            </button>
            <button
              type="button"
              onClick={() => setView('upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                border: 'none',
                padding: '12px 20px',
                borderRadius: 12,
                boxShadow: '0 0 22px rgba(124,58,237,0.4)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 15 }}>+</span> Upload Content
            </button>
          </div>
        </header>

        {loadError && !isDemoMode() && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              fontSize: 12.5,
              color: '#FCA5A5',
            }}
          >
            {loadError} — showing empty data.
          </div>
        )}

        {view === 'overview' && (
          <ProfessorOverview
            stats={stats}
            firstName={firstName}
            onGoUpload={() => setView('upload')}
            onGoBank={() => setView('bank')}
            onGoRoster={() => setView('roster')}
          />
        )}
        {view === 'upload' && (
          <UploadWizard
            modules={modules}
            onPublished={async () => {
              await Promise.all([refreshStats(), refreshModules()]);
            }}
            onChapterCreated={refreshModules}
          />
        )}
        {view === 'bank' && (
          <QuestionBank
            modules={modules}
            onChanged={async () => {
              await Promise.all([refreshStats(), refreshModules()]);
            }}
          />
        )}
        {view === 'roster' && <StudentRosterPanel />}
        {view === 'exams' && <MockExamsPanel modules={modules} />}
        {view === 'challenges' && <PostLecturePanel modules={modules} />}
      </main>
    </div>
  );
}
