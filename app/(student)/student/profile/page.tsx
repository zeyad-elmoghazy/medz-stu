'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { ProfileHeader } from '@/components/student/profile/ProfileHeader';
import {
  BadgesCard,
  QuickLinks,
  StatsOverview,
  SubjectProgress,
} from '@/components/student/profile/StatsSections';
import { EditDetailsCard } from '@/components/student/profile/EditDetailsCard';
import {
  AccountCard,
  PreferencesCard,
  SecurityCard,
} from '@/components/student/profile/AccountCards';
import { Notice } from '@/components/student/profile/ui';
import { academicSession } from '@/lib/academic-year';
import { getEmptyStudentStats, type StudentStats } from '@/lib/dashboard-data';
import {
  changeStudentPassword,
  deleteStudentAccount,
  fetchMyLeaderboardRow,
  fetchStudentProfile,
  fetchStudentStats,
  updateStudentProfile,
} from '@/lib/student-api';
import { toProfileDto, type StudentProfileDto } from '@/lib/student-profile';
import type { ProfilePatch } from '@/lib/profile-schema';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  writeDemoProfile,
  type LeaderboardRow,
} from '@/lib/supabase';
import { useStudentProfile } from '@/lib/use-display-name';
import { useStudentTheme } from '@/lib/use-student-theme';

const DEMO_NOTE = 'Not available in demo mode — there is no real account behind it.';

/** Demo mode keeps the profile in localStorage; shape it like the API's DTO. */
function demoProfileDto(): StudentProfileDto | null {
  const demo = readDemoProfile();
  if (!demo) return null;
  return toProfileDto({
    id: demo.id,
    role: demo.role,
    full_name: demo.full_name,
    username: demo.username ?? null,
    email: demo.email,
    created_at: '',
    academic_year: demo.academic_year ?? null,
    academic_year_session: demo.academic_year_session ?? null,
    notify_email: demo.notify_email ?? true,
    notify_reminders: demo.notify_reminders ?? true,
    total_xp: 0,
  });
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { refresh: refreshNavProfile, academicYear: sharedYear } = useStudentProfile();
  const { theme, setTheme } = useStudentTheme();
  const demo = isDemoMode();

  const [profile, setProfile] = useState<StudentProfileDto | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [rank, setRank] = useState<LeaderboardRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (demo) {
        if (cancelled) return;
        setProfile(demoProfileDto());
        setStats(getEmptyStudentStats());
        setLoading(false);
        return;
      }
      // The profile is essential; stats and rank are best-effort so a
      // slow or failing analytics query can't block editing the account.
      const [profileRes, statsRes, rankRes] = await Promise.allSettled([
        fetchStudentProfile(),
        fetchStudentStats(),
        fetchMyLeaderboardRow(),
      ]);
      if (cancelled) return;
      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value);
      } else {
        setLoadError(
          profileRes.reason instanceof Error ? profileRes.reason.message : 'Failed to load your profile'
        );
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (rankRes.status === 'fulfilled') setRank(rankRes.value);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  // The one-time year prompt saves through the shared provider, not this
  // page, so this page's own copy of the profile can go stale. When the
  // shared year moves out from under it, pull a fresh copy.
  const pageYear = profile?.academicYear;
  useEffect(() => {
    if (!profile || sharedYear == null || sharedYear === pageYear) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = demo ? demoProfileDto() : await fetchStudentProfile();
        if (!cancelled && fresh) setProfile(fresh);
      } catch {
        /* keep what we have; the next full load will correct it */
      }
    })();
    return () => {
      cancelled = true;
    };
    // `profile` itself is deliberately not a dependency: only a change in
    // either year should trigger a re-sync, not every profile edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedYear, pageYear, demo]);

  const saveProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (demo) {
        const current = readDemoProfile();
        if (!current) throw new Error('No demo profile found');
        const { academic_year, full_name, ...rest } = patch;
        writeDemoProfile({
          ...current,
          ...rest,
          ...(full_name !== undefined ? { full_name } : {}),
          ...(academic_year !== undefined
            ? { academic_year, academic_year_session: academicSession() }
            : {}),
        });
        setProfile(demoProfileDto());
      } else {
        setProfile(await updateStudentProfile(patch));
      }
      // Keep the navbar name / year prompt in step with what was saved.
      void refreshNavProfile();
    },
    [demo, refreshNavProfile]
  );

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!demo) await createBrowserClient().auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  async function handleDelete(confirmEmail: string) {
    await deleteStudentAccount(confirmEmail);
    // The server already ended the session; clear any client-side residue.
    await createBrowserClient().auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
      }}
    >
      <StudentNavbar />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 80px' }}>
        <header style={{ marginTop: 4 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'var(--accent-text)',
              textTransform: 'uppercase',
            }}
          >
            Profile &amp; Settings
          </p>
          <h1
            style={{
              margin: '10px 0 0',
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}
          >
            Your account
          </h1>
        </header>

        {loadError && (
          <div style={{ marginTop: 24 }}>
            <Notice kind="error">{loadError}</Notice>
          </div>
        )}

        <ProfileHeader profile={profile} rank={rank} loading={loading} />

        <StatsOverview
          stats={stats}
          totalXp={profile ? profile.totalXp : null}
          rank={rank}
          loading={loading}
        />
        <SubjectProgress stats={stats} />
        <BadgesCard badges={profile?.badges ?? []} />
        <QuickLinks bookmarksCount={stats ? stats.bookmarksCount : null} />

        {profile && (
          <>
            <EditDetailsCard key={profile.id} profile={profile} onSave={saveProfile} />
            <PreferencesCard
              profile={profile}
              onSave={saveProfile}
              theme={theme}
              setTheme={setTheme}
            />
            <SecurityCard
              onChangePassword={changeStudentPassword}
              unavailableReason={demo ? DEMO_NOTE : undefined}
            />
            <AccountCard
              email={profile.email}
              signingOut={signingOut}
              onLogout={handleLogout}
              onDelete={handleDelete}
              deleteUnavailableReason={demo ? DEMO_NOTE : undefined}
            />
          </>
        )}
      </div>
    </main>
  );
}
