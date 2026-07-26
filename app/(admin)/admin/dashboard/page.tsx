'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Download,
  Edit3,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Megaphone,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { clearDemoProfile, createBrowserClient, isDemoMode } from '@/lib/supabase';

type AdminOverview = {
  counts: {
    professors: number;
    students: number;
    published_questions: number;
    total_questions: number;
    under_review: number;
    draft: number;
    flagged: number;
  };
  professors: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    joined_at: string;
    stats: {
      draft: number;
      under_review: number;
      published: number;
      archived: number;
      flagged: number;
      last_activity: string | null;
    };
  }>;
  subjects: Array<{
    subject_id: string;
    module_count: number;
    question_count: number;
    published_count: number;
    professor_count: number;
  }>;
  recent_uploads: Array<{
    id: string;
    professor_name: string;
    module_code: string | null;
    method: string;
    status: string;
    questions_extracted: number;
    questions_under_review: number;
    created_at: string;
  }>;
  recent_published: Array<{
    id: number;
    professor_name: string;
    subject_id: string;
    question_preview: string;
    created_at: string;
  }>;
};
import { cn } from '@/lib/utils';

// Recharts + its d3-* deps weigh ~100KB gzipped. Defer that cost
// so the admin page's initial JS doesn't include a chart the user
// may never scroll to.
const PlatformStatsPanel = dynamic(
  () => import('@/components/dashboard/PlatformStatsPanel'),
  {
    ssr: false,
    loading: () => (
      <section
        className="rounded-2xl p-6 lg:p-7"
        style={{
          backgroundColor: '#0F0F1A',
          border: '1px solid #1E1E2E',
          minHeight: 320,
        }}
        aria-busy="true"
      />
    ),
  }
);

type NavItem = {
  label: string;
  href: string;
  hash?: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Users', href: '/admin/dashboard', hash: 'users', icon: <UsersRound className="h-4 w-4" /> },
  { label: 'Professors', href: '/admin/dashboard', hash: 'professors', icon: <GraduationCap className="h-4 w-4" /> },
  { label: 'Students', href: '/admin/dashboard', hash: 'students', icon: <Users className="h-4 w-4" /> },
  { label: 'Subjects', href: '/admin/dashboard', hash: 'subjects', icon: <Layers className="h-4 w-4" /> },
  { label: 'Questions', href: '/admin/dashboard', hash: 'questions', icon: <ListChecks className="h-4 w-4" /> },
  { label: 'Analytics', href: '/admin/dashboard', hash: 'analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { label: 'Settings', href: '/admin/dashboard', hash: 'settings', icon: <Settings className="h-4 w-4" /> },
];

type UserRow = {
  id: number;
  name: string;
  role: 'Student' | 'Professor' | 'Admin';
  email: string;
  joined: string;
  status: 'Active' | 'Suspended';
};

const INITIAL_USERS: UserRow[] = [
  { id: 1, name: 'Omar Abdelaziz', role: 'Student', email: 'omar.abdelaziz@kasralainy.edu', joined: '2026-06-15', status: 'Active' },
  { id: 2, name: 'Salma Ahmed', role: 'Student', email: 'salma.ahmed@medicine.aucegypt.edu', joined: '2026-06-14', status: 'Active' },
  { id: 3, name: 'Dr. Ahmed Zahra', role: 'Professor', email: 'a.zahra@cu.edu.eg', joined: '2026-05-02', status: 'Active' },
  { id: 4, name: 'Yusuf Khalil', role: 'Student', email: 'yusuf.khalil@asu.edu.eg', joined: '2026-06-12', status: 'Active' },
  { id: 5, name: 'Nour El-Sayed', role: 'Student', email: 'nour.elsayed@alexmed.edu.eg', joined: '2026-06-10', status: 'Suspended' },
  { id: 6, name: 'Dr. Sarah Mansour', role: 'Professor', email: 's.mansour@cu.edu.eg', joined: '2026-06-09', status: 'Active' },
  { id: 7, name: 'Farida Galal', role: 'Student', email: 'farida.galal@kasralainy.edu', joined: '2026-06-08', status: 'Active' },
  { id: 8, name: 'Mahmoud Ibrahim', role: 'Student', email: 'mahmoud.ibrahim@asu.edu.eg', joined: '2026-06-07', status: 'Active' },
];

type ActivityItem = {
  id: number;
  text: string;
  time: string;
  tone: 'violet' | 'emerald' | 'amber' | 'rose';
  icon: React.ReactNode;
};

const ACTIVITY_FEED: ActivityItem[] = [
  { id: 1, text: 'Dr. Ahmed Zahra uploaded 11 new questions to Histology — Block 1', time: '2h ago', tone: 'violet', icon: <UploadCloud className="h-3.5 w-3.5" /> },
  { id: 2, text: 'Omar A. completed Histology challenge with 82% accuracy', time: '3h ago', tone: 'emerald', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { id: 3, text: 'New professor registered — Dr. Sarah Mansour (Cairo University)', time: '1d ago', tone: 'violet', icon: <UserPlus className="h-3.5 w-3.5" /> },
  { id: 4, text: '12 students flagged Q7 on Pars nervosa for review', time: '1d ago', tone: 'amber', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  { id: 5, text: 'Nour El-Sayed account suspended for terms-of-service violation', time: '2d ago', tone: 'rose', icon: <UserMinus className="h-3.5 w-3.5" /> },
  { id: 6, text: 'Block 1 cohort accuracy crossed 70% — milestone reached', time: '3d ago', tone: 'emerald', icon: <Zap className="h-3.5 w-3.5" /> },
];

type SubjectRow = {
  id: number;
  name: string;
  professor: string;
  questionCount: number;
  active: boolean;
};

const INITIAL_SUBJECTS: SubjectRow[] = [
  { id: 1, name: 'Histology — Block 1', professor: 'Dr. Ahmed Zahra', questionCount: 11, active: true },
  { id: 2, name: 'Anatomy', professor: 'Pending faculty', questionCount: 0, active: false },
  { id: 3, name: 'Physiology', professor: 'Pending faculty', questionCount: 0, active: false },
  { id: 4, name: 'Biochemistry', professor: 'Pending faculty', questionCount: 0, active: false },
  { id: 5, name: 'Pharmacology', professor: 'Pending faculty', questionCount: 0, active: false },
];

const DAU_CHART = [
  { day: 'Mon', users: 842 },
  { day: 'Tue', users: 904 },
  { day: 'Wed', users: 951 },
  { day: 'Thu', users: 1023 },
  { day: 'Fri', users: 1087 },
  { day: 'Sat', users: 1144 },
  { day: 'Sun', users: 1189 },
];

type Toast = { id: number; tone: 'success' | 'error' | 'info'; message: string };
type ConfirmConfig = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [users, setUsers] = useState<UserRow[]>(INITIAL_USERS);
  const [subjects, setSubjects] = useState<SubjectRow[]>(INITIAL_SUBJECTS);
  // Live overview from the DB — populated by /api/admin/overview
  // when the admin is authenticated against a real Supabase. In
  // demo mode this stays null and the page renders the seeded
  // INITIAL_* fixtures (never confused with fake DB numbers).
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    if (isDemoMode()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/overview', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as AdminOverview;
        if (!cancelled) setOverview(body);
      } catch {
        /* silent — page still renders with fixtures */
      }
    })();
    // Poll — matches the 30 s Cache-Control on the endpoint so
    // an admin sees new professor activity within a minute.
    const iv = window.setInterval(async () => {
      if (cancelled || isDemoMode()) return;
      try {
        const res = await fetch('/api/admin/overview', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) setOverview((await res.json()) as AdminOverview);
      } catch {
        /* keep last successful value */
      }
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(message: string, tone: Toast['tone'] = 'success') {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }

  // Live if overview loaded (real DB); fixture otherwise (demo /
  // unauth). This is the only source of truth for the KPI row and
  // any panel that reads `stats.*`.
  const stats = useMemo(() => {
    if (overview) {
      return {
        total: overview.counts.professors + overview.counts.students,
        activeStudents: overview.counts.students,
        professors: overview.counts.professors,
        questionsInBank: overview.counts.published_questions,
        underReview: overview.counts.under_review,
        flagged: overview.counts.flagged,
      };
    }
    return {
      total: 1247,
      activeStudents: 1189,
      professors: 12,
      questionsInBank: 450,
      underReview: 12,
      flagged: 2,
    };
  }, [overview]);

  function toggleStatus(id: number) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: u.status === 'Active' ? 'Suspended' : 'Active' }
          : u
      )
    );
    const u = users.find((x) => x.id === id);
    if (u) {
      pushToast(
        `${u.name} ${u.status === 'Active' ? 'suspended' : 'reactivated'}.`,
        u.status === 'Active' ? 'info' : 'success'
      );
    }
  }

  function requestRemove(id: number) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    setConfirm({
      title: `Remove ${u.name}?`,
      body: 'This cannot be undone. Their answers, notes, and bookmarks will be deleted.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => {
        setUsers((prev) => prev.filter((x) => x.id !== id));
        pushToast(`${u.name} removed from the platform.`, 'success');
      },
    });
  }

  function toggleSubject(id: number) {
    setSubjects((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  }

  function beginEditSubject(s: SubjectRow) {
    setEditingSubjectId(s.id);
    setEditingDraft(s.name);
  }

  function saveSubjectName(id: number) {
    const trimmed = editingDraft.trim();
    if (trimmed.length === 0) return;
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
    setEditingSubjectId(null);
    setEditingDraft('');
    pushToast('Subject renamed.');
  }

  function addNewSubject() {
    const trimmed = newSubjectName.trim();
    if (trimmed.length === 0) {
      pushToast('Subject name cannot be empty.', 'error');
      return;
    }
    setSubjects((prev) => [
      ...prev,
      {
        id: Math.max(0, ...prev.map((s) => s.id)) + 1,
        name: trimmed,
        professor: 'Pending faculty',
        questionCount: 0,
        active: false,
      },
    ]);
    setNewSubjectName('');
    setAddingSubject(false);
    pushToast('Subject added.');
  }

  function handleExportData() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      stats,
      users,
      subjects,
      activity: ACTIVITY_FEED.map((a) => ({ text: a.text, time: a.time })),
      dailyActiveUsers: DAU_CHART,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medz-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast('Snapshot downloaded.', 'success');
  }

  function handleSendAnnouncement(message: string) {
    setAnnouncement(null);
    pushToast(`Announcement sent to ${stats.total.toLocaleString()} users.`, 'success');
  }

  function requestResetScores() {
    setConfirm({
      title: 'Reset every student score?',
      body: 'All quiz attempts, accuracy, and streak records will be wiped. Bookmarks and notes are preserved.',
      confirmLabel: 'Reset all scores',
      destructive: true,
      onConfirm: () => {
        pushToast('All scores reset across the cohort.', 'info');
      },
    });
  }

  async function handleLogout() {
    clearDemoProfile();
    if (!isDemoMode()) {
      await supabase.auth.signOut().catch(() => {});
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: '#09090E' }}>
      <TopNav onLogout={handleLogout} />

      <div className="mx-auto flex w-full max-w-7xl">
        <SideNav items={NAV_ITEMS} />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
          }}
          className="flex-1 px-6 py-10 lg:px-10"
        >
          <FadeUp>
            <Header />
          </FadeUp>

          <FadeUp className="mt-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Users" value={stats.total.toLocaleString()} icon={<UsersRound className="h-4 w-4" />} accent="#9F67FF" hint={overview ? 'from Supabase' : 'demo fixture'} />
              <StatCard label="Active Students" value={stats.activeStudents.toLocaleString()} icon={<Users className="h-4 w-4" />} accent="#10B981" hint={stats.total > 0 ? `${Math.round((stats.activeStudents / stats.total) * 100)}% of base` : ''} />
              <StatCard label="Professors" value={String(stats.professors)} icon={<GraduationCap className="h-4 w-4" />} accent="#9F67FF" hint={overview ? 'live count' : '+1 pending'} />
              <StatCard label="Questions in Bank" value={stats.questionsInBank.toLocaleString()} icon={<ListChecks className="h-4 w-4" />} accent="#F59E0B" hint={`${stats.underReview} under review`} />
            </div>
          </FadeUp>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
            <div className="flex flex-col gap-6">
              <FadeUp>
                <UsersTablePanel
                  users={users}
                  onToggleStatus={toggleStatus}
                  onRequestRemove={requestRemove}
                />
              </FadeUp>
              <FadeUp>
                <ActivityFeedPanel />
              </FadeUp>
              {overview && (
                <FadeUp>
                  <ProfessorActivityPanel overview={overview} />
                </FadeUp>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <FadeUp>
                <SubjectManagementPanel
                  subjects={subjects}
                  editingSubjectId={editingSubjectId}
                  editingDraft={editingDraft}
                  setEditingDraft={setEditingDraft}
                  onToggle={toggleSubject}
                  onBeginEdit={beginEditSubject}
                  onCancelEdit={() => {
                    setEditingSubjectId(null);
                    setEditingDraft('');
                  }}
                  onSave={saveSubjectName}
                  addingSubject={addingSubject}
                  newSubjectName={newSubjectName}
                  setNewSubjectName={setNewSubjectName}
                  onAddNew={() => setAddingSubject(true)}
                  onCancelAddNew={() => {
                    setAddingSubject(false);
                    setNewSubjectName('');
                  }}
                  onSubmitAddNew={addNewSubject}
                />
              </FadeUp>
              <FadeUp>
                <PlatformStatsPanel data={DAU_CHART} />
              </FadeUp>
              <FadeUp>
                <QuickActionsPanel
                  onExport={handleExportData}
                  onAnnounce={() => setAnnouncement('')}
                  onResetScores={requestResetScores}
                />
              </FadeUp>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {confirm && (
          <ConfirmModal
            config={confirm}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              confirm.onConfirm();
              setConfirm(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {announcement !== null && (
          <AnnouncementModal
            initialValue={announcement}
            onClose={() => setAnnouncement(null)}
            onSend={handleSendAnnouncement}
          />
        )}
      </AnimatePresence>

      <ToastStack toasts={toasts} />
    </main>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-violet-300">
          Admin Console · MedZ Operations
        </p>
        <h1
          className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl"
          style={{ textShadow: '0 0 18px rgba(124,58,237,0.45)' }}
        >
          Welcome back, admin
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Users, content, and platform health — every lever in one place.
        </p>
      </div>
      <span
        className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs text-emerald-300 md:self-auto"
        style={{
          backgroundColor: 'rgba(16,185,129,0.12)',
          border: '1px solid rgba(16,185,129,0.4)',
        }}
      >
        <ShieldCheck className="h-3 w-3" />
        All systems normal
      </span>
    </div>
  );
}

function TopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        backgroundColor: 'rgba(9, 9, 14, 0.85)',
        borderBottom: '1px solid #1E1E2E',
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-400"
            style={{ boxShadow: '0 0 18px rgba(124,58,237,0.55)' }}
          >
            <ActivityIcon className="h-4 w-4 text-white" />
          </span>
          <div className="flex flex-col leading-tight">
            <span
              className="text-base font-bold tracking-tight text-white"
              style={{ textShadow: '0 0 14px rgba(124,58,237,0.5)' }}
            >
              MedZ
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Admin
            </span>
          </div>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs text-text-muted transition hover:text-white"
          style={{ border: '1px solid #1E1E2E', backgroundColor: '#0F0F1A' }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}

function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside
      className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col px-3 py-6 lg:flex"
      style={{ borderRight: '1px solid #1E1E2E', backgroundColor: 'rgba(9,9,14,0.6)' }}
    >
      <nav className="flex flex-col gap-1">
        {items.map((item, i) => {
          const isActive = i === 0 && pathname?.endsWith('/admin/dashboard');
          const href = item.hash ? `${item.href}#${item.hash}` : item.href;
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                isActive
                  ? 'text-white'
                  : 'text-text-muted hover:bg-white/5 hover:text-white'
              )}
              style={
                isActive
                  ? {
                      backgroundColor: 'rgba(124, 58, 237, 0.18)',
                      boxShadow: 'inset 0 0 0 1px rgba(159,103,255,0.35)',
                    }
                  : undefined
              }
            >
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md',
                  isActive
                    ? 'bg-violet-500 text-white shadow-[0_0_14px_rgba(124,58,237,0.5)]'
                    : 'bg-white/5 text-text-muted group-hover:text-white'
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto rounded-xl p-4"
        style={{ border: '1px solid #1E1E2E', backgroundColor: '#0F0F1A' }}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Region
        </p>
        <p className="mt-1.5 text-sm font-semibold text-white">MENA · Egypt</p>
        <p className="mt-1 text-xs text-text-muted">4 universities</p>
      </div>
    </aside>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  hint: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full"
        style={{ background: `${accent}26`, filter: 'blur(32px)' }}
      />
      <div className="relative">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
          {value}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
          {label}
        </p>
        <p className="mt-2 text-xs text-text-muted">{hint}</p>
      </div>
    </div>
  );
}

function UsersTablePanel({
  users,
  onToggleStatus,
  onRequestRemove,
}: {
  users: UserRow[];
  onToggleStatus: (id: number) => void;
  onRequestRemove: (id: number) => void;
}) {
  return (
    <section
      id="users"
      className="rounded-2xl"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
            User management
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Recent users
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Latest 8 sign-ups · suspend or remove from this table.
          </p>
        </div>
        <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-200">
          {users.length} shown
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
              <th className="py-3 pl-6 pr-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">Joined</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="py-3 pl-3 pr-6 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {users.map((u) => (
                <motion.tr
                  key={u.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  style={{ borderTop: '1px solid #1E1E2E' }}
                >
                  <td className="py-3 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white',
                          u.status === 'Suspended' && 'opacity-50 grayscale'
                        )}
                        style={{
                          background:
                            'linear-gradient(135deg, #7C3AED 0%, #9F67FF 100%)',
                          boxShadow: '0 0 12px rgba(124,58,237,0.4)',
                        }}
                      >
                        {u.name
                          .split(' ')
                          .map((n) => n[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </span>
                      <span className="font-medium text-white">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={
                        u.role === 'Professor'
                          ? {
                              backgroundColor: 'rgba(124,58,237,0.15)',
                              color: '#C4B5FD',
                            }
                          : u.role === 'Admin'
                            ? {
                                backgroundColor: 'rgba(245,158,11,0.15)',
                                color: '#FCD34D',
                              }
                            : {
                                backgroundColor: 'rgba(16,185,129,0.12)',
                                color: '#6EE7B7',
                              }
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    <span className="block max-w-[200px] truncate">{u.email}</span>
                  </td>
                  <td className="px-3 py-3 text-text-muted">{u.joined}</td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={
                        u.status === 'Active'
                          ? {
                              backgroundColor: 'rgba(16,185,129,0.12)',
                              color: '#6EE7B7',
                              border: '1px solid rgba(16,185,129,0.35)',
                            }
                          : {
                              backgroundColor: 'rgba(239,68,68,0.12)',
                              color: '#FCA5A5',
                              border: '1px solid rgba(239,68,68,0.35)',
                            }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: u.status === 'Active' ? '#10B981' : '#EF4444',
                        }}
                      />
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 pl-3 pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleStatus(u.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition"
                        style={{
                          color: '#FCA5A5',
                          border: '1px solid rgba(239,68,68,0.4)',
                          backgroundColor: 'rgba(239,68,68,0.06)',
                        }}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        {u.status === 'Active' ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestRemove(u.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-white transition"
                        style={{
                          backgroundColor: '#EF4444',
                          boxShadow: '0 0 14px rgba(239,68,68,0.4)',
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-10 text-center text-sm text-text-muted">
            No users to display.
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityFeedPanel() {
  const toneColor: Record<ActivityItem['tone'], { bg: string; color: string }> = {
    violet: { bg: 'rgba(124,58,237,0.15)', color: '#C4B5FD' },
    emerald: { bg: 'rgba(16,185,129,0.15)', color: '#6EE7B7' },
    amber: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
    rose: { bg: 'rgba(239,68,68,0.15)', color: '#FCA5A5' },
  };
  return (
    <section
      id="activity"
      className="rounded-2xl p-6 lg:p-7"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Audit log
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Recent activity
          </h2>
        </div>
        <span className="text-xs text-text-muted">Last 72h</span>
      </div>

      <ol className="relative mt-5 space-y-3 border-l pl-5" style={{ borderColor: '#1E1E2E' }}>
        {ACTIVITY_FEED.map((item) => {
          const tone = toneColor[item.tone];
          return (
            <li key={item.id} className="relative">
              <span
                className="absolute -left-[27px] top-1 grid h-5 w-5 place-items-center rounded-full text-[10px]"
                style={{
                  backgroundColor: tone.bg,
                  color: tone.color,
                  border: `1px solid ${tone.color}40`,
                  boxShadow: `0 0 10px ${tone.color}30`,
                }}
              >
                {item.icon}
              </span>
              <div className="rounded-xl p-3" style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}>
                <p className="text-sm leading-relaxed text-white">{item.text}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  {item.time}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// -----------------------------------------------------------
// ProfessorActivityPanel — the "admin sees what professors are
// doing" surface. Renders three lists from a single API call:
//   • Per-professor authoring stats (draft / review / published
//     / flagged) — one row per professor.
//   • Recent upload_jobs (both manual and AI paths land here).
//   • Recent published questions.
// Only rendered when the live overview API is reachable; demo
// mode falls back to the seeded ACTIVITY_FEED above.
// -----------------------------------------------------------
function ProfessorActivityPanel({ overview }: { overview: AdminOverview }) {
  const rel = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };
  return (
    <section
      id="professors"
      className="rounded-2xl p-6 lg:p-7"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Live · Supabase
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Professor authoring
          </h2>
        </div>
        <span className="text-xs text-text-muted">
          {overview.professors.length} professor
          {overview.professors.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Per-professor stats */}
      <div className="mt-5 space-y-2">
        {overview.professors.length === 0 && (
          <p className="text-xs text-text-muted">
            No professors have joined yet.
          </p>
        )}
        {overview.professors.map((p) => (
          <div
            key={p.id}
            className="rounded-xl p-3"
            style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {p.full_name ?? p.email ?? 'Unnamed professor'}
                </p>
                <p className="truncate text-[11px] text-text-muted">{p.email}</p>
              </div>
              <div className="flex flex-none gap-3 text-[11px]">
                <span title="Published" style={{ color: '#10B981' }}>
                  {p.stats.published}✓
                </span>
                <span title="Under review" style={{ color: '#0EA5E9' }}>
                  {p.stats.under_review}○
                </span>
                <span title="Drafts" style={{ color: '#94A3B8' }}>
                  {p.stats.draft}✎
                </span>
                <span
                  title="Flagged"
                  style={{ color: p.stats.flagged > 0 ? '#EF4444' : '#475569' }}
                >
                  ⚑{p.stats.flagged}
                </span>
              </div>
            </div>
            {p.stats.last_activity && (
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-text-muted">
                Last change {rel(p.stats.last_activity)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Recent upload jobs */}
      {overview.recent_uploads.length > 0 && (
        <>
          <p className="mt-6 text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Recent uploads
          </p>
          <ul className="mt-2 space-y-1.5">
            {overview.recent_uploads.slice(0, 5).map((u) => (
              <li
                key={u.id}
                className="rounded-lg px-3 py-2 text-[11.5px]"
                style={{
                  backgroundColor: '#0A0A12',
                  border: '1px solid #1E1E2E',
                }}
              >
                <span style={{ color: '#F8FAFC' }}>{u.professor_name}</span>
                <span className="text-text-muted"> · {u.method} ·</span>{' '}
                <span style={{ color: '#C4B5FD' }}>HIST {u.module_code ?? '?'}</span>
                <span className="text-text-muted">
                  {' '}
                  · {u.status}
                  {u.questions_extracted > 0
                    ? ` · ${u.questions_extracted} extracted`
                    : ''}
                </span>
                <span className="ml-2 text-[10px] text-text-muted">
                  {rel(u.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Recent published */}
      {overview.recent_published.length > 0 && (
        <>
          <p className="mt-6 text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Newly published questions
          </p>
          <ul className="mt-2 space-y-1.5">
            {overview.recent_published.slice(0, 5).map((q) => (
              <li
                key={q.id}
                className="rounded-lg px-3 py-2 text-[11.5px]"
                style={{
                  backgroundColor: '#0A0A12',
                  border: '1px solid #1E1E2E',
                }}
              >
                <span style={{ color: '#10B981' }}>#{q.id}</span>{' '}
                <span className="text-text-muted">by {q.professor_name} ·</span>{' '}
                <span style={{ color: '#C4B5FD', textTransform: 'capitalize' }}>
                  {q.subject_id}
                </span>
                <p
                  className="mt-1 line-clamp-2 text-text-muted"
                  style={{ fontSize: 11 }}
                >
                  {q.question_preview}
                  {q.question_preview.length >= 100 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SubjectManagementPanel({
  subjects,
  editingSubjectId,
  editingDraft,
  setEditingDraft,
  onToggle,
  onBeginEdit,
  onCancelEdit,
  onSave,
  addingSubject,
  newSubjectName,
  setNewSubjectName,
  onAddNew,
  onCancelAddNew,
  onSubmitAddNew,
}: {
  subjects: SubjectRow[];
  editingSubjectId: number | null;
  editingDraft: string;
  setEditingDraft: (v: string) => void;
  onToggle: (id: number) => void;
  onBeginEdit: (s: SubjectRow) => void;
  onCancelEdit: () => void;
  onSave: (id: number) => void;
  addingSubject: boolean;
  newSubjectName: string;
  setNewSubjectName: (v: string) => void;
  onAddNew: () => void;
  onCancelAddNew: () => void;
  onSubmitAddNew: () => void;
}) {
  return (
    <section
      id="subjects"
      className="rounded-2xl p-6 lg:p-7"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Catalog
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Subject management
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Toggle visibility, rename, or add a new block.
          </p>
        </div>
        {!addingSubject && (
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-violet-200 transition hover:text-white"
            style={{
              border: '1px solid rgba(159,103,255,0.4)',
              backgroundColor: 'rgba(124,58,237,0.12)',
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Subject
          </button>
        )}
      </div>

      <ul className="mt-5 space-y-2">
        {subjects.map((s) => {
          const isEditing = editingSubjectId === s.id;
          return (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}
            >
              <Toggle active={s.active} onToggle={() => onToggle(s.id)} />
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSave(s.id);
                        if (e.key === 'Escape') onCancelEdit();
                      }}
                      autoFocus
                      className="h-8 flex-1 rounded-md px-2 text-sm text-white focus:outline-none"
                      style={{
                        backgroundColor: '#09090E',
                        border: '1px solid #7C3AED',
                        boxShadow: '0 0 14px rgba(124,58,237,0.3)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onSave(s.id)}
                      aria-label="Save"
                      className="grid h-8 w-8 place-items-center rounded-md text-white"
                      style={{
                        backgroundColor: '#10B981',
                        boxShadow: '0 0 12px rgba(16,185,129,0.4)',
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      aria-label="Cancel"
                      className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition hover:text-white"
                      style={{
                        border: '1px solid #1E1E2E',
                        backgroundColor: '#09090E',
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={cn(
                      'truncate text-sm font-medium',
                      s.active ? 'text-white' : 'text-text-muted'
                    )}>
                      {s.name}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {s.professor} · {s.questionCount} questions
                    </p>
                  </>
                )}
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => onBeginEdit(s)}
                  aria-label={`Edit ${s.name}`}
                  className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition hover:text-white"
                  style={{
                    border: '1px solid #1E1E2E',
                    backgroundColor: '#09090E',
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}

        {addingSubject && (
          <li
            className="rounded-xl p-3"
            style={{
              backgroundColor: 'rgba(124,58,237,0.08)',
              border: '1px dashed rgba(159,103,255,0.45)',
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300">
              New subject
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmitAddNew();
                  if (e.key === 'Escape') onCancelAddNew();
                }}
                autoFocus
                placeholder="e.g. Cardiology — Block 1"
                className="h-9 flex-1 rounded-md px-3 text-sm text-white placeholder:text-text-muted/60 focus:outline-none"
                style={{
                  backgroundColor: '#09090E',
                  border: '1px solid #1E1E2E',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#7C3AED')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1E1E2E')}
              />
              <button
                type="button"
                onClick={onSubmitAddNew}
                className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs font-semibold text-white"
                style={{
                  backgroundColor: '#7C3AED',
                  boxShadow: '0 0 16px rgba(124,58,237,0.45)',
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Add
              </button>
              <button
                type="button"
                onClick={onCancelAddNew}
                className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs text-text-muted transition hover:text-white"
                style={{
                  border: '1px solid #1E1E2E',
                  backgroundColor: '#09090E',
                }}
              >
                Cancel
              </button>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className="relative grid h-6 w-11 shrink-0 place-items-start rounded-full p-0.5 transition"
      style={{
        backgroundColor: active ? '#7C3AED' : '#1E1E2E',
        boxShadow: active ? '0 0 14px rgba(124,58,237,0.5)' : 'none',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="block h-5 w-5 rounded-full bg-white shadow-md"
        style={{ marginLeft: active ? '20px' : '0px' }}
      />
    </button>
  );
}


function QuickActionsPanel({
  onExport,
  onAnnounce,
  onResetScores,
}: {
  onExport: () => void;
  onAnnounce: () => void;
  onResetScores: () => void;
}) {
  return (
    <section
      id="actions"
      className="rounded-2xl p-6 lg:p-7"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
        Quick actions
      </p>
      <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
        Run a one-shot
      </h2>

      <div className="mt-5 grid gap-2.5">
        <ActionButton
          icon={<Download className="h-4 w-4" />}
          label="Export All Data"
          description="Download a JSON snapshot of users, subjects, and stats."
          onClick={onExport}
          tone="violet"
        />
        <ActionButton
          icon={<Megaphone className="h-4 w-4" />}
          label="Send Announcement"
          description="Broadcast a message to every active user."
          onClick={onAnnounce}
          tone="violet"
        />
        <ActionButton
          icon={<RotateCcw className="h-4 w-4" />}
          label="Reset All Scores"
          description="Wipe accuracy & streak history. Bookmarks stay."
          onClick={onResetScores}
          tone="rose"
        />
      </div>
    </section>
  );
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  tone: 'violet' | 'rose';
}) {
  const palette =
    tone === 'rose'
      ? {
          iconBg: 'rgba(239,68,68,0.15)',
          iconColor: '#FCA5A5',
          hoverBorder: 'rgba(239,68,68,0.45)',
        }
      : {
          iconBg: 'rgba(124,58,237,0.15)',
          iconColor: '#C4B5FD',
          hoverBorder: 'rgba(159,103,255,0.5)',
        };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition"
      style={{
        backgroundColor: '#0A0A12',
        border: '1px solid #1E1E2E',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = palette.hoverBorder;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1E1E2E';
      }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: palette.iconBg, color: palette.iconColor }}
      >
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-white" />
    </button>
  );
}

function ConfirmModal({
  config,
  onCancel,
  onConfirm,
}: {
  config: ConfirmConfig;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur"
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
        style={{
          backgroundColor: '#0F0F1A',
          border: '1px solid #1E1E2E',
          boxShadow: '0 40px 120px -20px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={
              config.destructive
                ? {
                    backgroundColor: 'rgba(239,68,68,0.15)',
                    color: '#FCA5A5',
                  }
                : {
                    backgroundColor: 'rgba(124,58,237,0.15)',
                    color: '#C4B5FD',
                  }
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              {config.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
              {config.body}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-text-primary transition hover:text-white"
            style={{ border: '1px solid #1E1E2E', backgroundColor: '#0A0A12' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white transition"
            style={{
              backgroundColor: config.destructive ? '#EF4444' : '#7C3AED',
              boxShadow: config.destructive
                ? '0 0 22px rgba(239,68,68,0.45)'
                : '0 0 22px rgba(124,58,237,0.5)',
            }}
          >
            {config.confirmLabel}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function AnnouncementModal({
  initialValue,
  onClose,
  onSend,
}: {
  initialValue: string;
  onClose: () => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState(initialValue);
  const [sending, setSending] = useState(false);

  async function send() {
    if (message.trim().length < 4 || sending) return;
    setSending(true);
    setTimeout(() => {
      onSend(message.trim());
    }, 600);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
        style={{
          backgroundColor: '#0F0F1A',
          border: '1px solid #1E1E2E',
          boxShadow: '0 40px 120px -20px rgba(124,58,237,0.4)',
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              backgroundColor: 'rgba(124,58,237,0.15)',
              color: '#C4B5FD',
            }}
          >
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              Send platform announcement
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Goes to all active users — students, professors, and admins.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-text-muted transition hover:text-white"
            style={{ border: '1px solid #1E1E2E', backgroundColor: '#0A0A12' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Block 1 review session moved to Sunday 6 PM — see schedule for details."
          className="mt-5 h-32 w-full resize-none rounded-xl p-4 text-sm leading-relaxed text-white placeholder:text-text-muted/60 focus:outline-none scrollbar-thin"
          style={{
            backgroundColor: '#0A0A12',
            border: '1px solid #1E1E2E',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7C3AED')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#1E1E2E')}
        />

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-text-muted">
            {message.length} chars · markdown not rendered
          </span>
          <button
            type="button"
            onClick={send}
            disabled={message.trim().length < 4 || sending}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: '#7C3AED',
              boxShadow: '0 0 22px rgba(124,58,237,0.5)',
            }}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Send
          </button>
        </div>
      </motion.div>
    </>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  const tonePalette: Record<Toast['tone'], { border: string; color: string; shadow: string; icon: React.ReactNode }> = {
    success: {
      border: '1px solid rgba(16,185,129,0.4)',
      color: '#A7F3D0',
      shadow: '0 0 24px rgba(16,185,129,0.25)',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    info: {
      border: '1px solid rgba(159,103,255,0.4)',
      color: '#C4B5FD',
      shadow: '0 0 24px rgba(124,58,237,0.25)',
      icon: <Bell className="h-4 w-4" />,
    },
    error: {
      border: '1px solid rgba(239,68,68,0.4)',
      color: '#FCA5A5',
      shadow: '0 0 24px rgba(239,68,68,0.25)',
      icon: <X className="h-4 w-4" />,
    },
  };

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const p = tonePalette[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
              style={{
                backgroundColor: '#0F0F1A',
                border: p.border,
                color: p.color,
                boxShadow: p.shadow,
              }}
            >
              {p.icon}
              {t.message}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function FadeUp({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
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
