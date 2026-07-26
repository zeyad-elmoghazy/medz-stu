'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, LogOut, Moon } from 'lucide-react';
import { MedZLogo } from '@/components/brand/MedZLogo';
import { NavToast, useNavToast } from '@/components/ui/NavToast';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';

// Single source of truth for the student top bar. Every /student
// page renders this so the header stays identical.

type NavLink = { label: string; href?: string; active?: boolean; toast?: string };

const DEFAULT_LINKS: NavLink[] = [
  { label: 'Home',         href: '/student/dashboard' },
  { label: 'Subjects',     href: '/student/subjects' },
  { label: 'Custom Exam',  href: '/student/exam' },
  { label: 'Post-Lecture', href: '/student/challenges' },
  { label: 'Flashcards',   toast: 'Coming soon.' },
  { label: 'AI Tutor',     toast: 'Coming soon.' },
  { label: 'Leaderboard' },
];

export function StudentNavbar({ activeLabel }: { activeLabel?: NavLink['label'] }) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const { message, showToast } = useNavToast();

  const [displayName, setDisplayName] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo?.full_name && !cancelled) setDisplayName(demo.full_name);
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
        if (!cancelled && profile?.full_name) setDisplayName(profile.full_name);
      } catch {
        /* leave blank on failure */
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!isDemoMode()) await supabase.auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const links: NavLink[] = DEFAULT_LINKS.map((l) => ({
    ...l,
    active: l.label === activeLabel,
    href: l.label === activeLabel ? undefined : l.href,
  }));

  const initials = displayName
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <nav
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 34px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <MedZLogo size="sm" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}>
          {links.map((link) => {
            if (link.href) {
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{ color: '#94A3B8', textDecoration: 'none', cursor: 'pointer' }}
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
                    color: '#94A3B8',
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
                  color: link.active ? '#F8FAFC' : '#94A3B8',
                  fontWeight: link.active ? 600 : 500,
                }}
              >
                {link.label}
              </span>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/student/dashboard?view=analytics"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              padding: '9px 16px',
              borderRadius: 10,
              boxShadow: '0 0 18px rgba(124,58,237,0.4)',
              textDecoration: 'none',
            }}
          >
            My Progress
          </Link>

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
              color: '#94A3B8',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <Moon style={{ width: 15, height: 15 }} />
          </button>

          <Link
            href="/student/profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: '#CBD5E1',
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
                background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {initials || 'ME'}
            </span>
            {displayName || 'Guest'}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13.5,
              fontWeight: 600,
              color: '#CBD5E1',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {signingOut ? (
              <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
            ) : (
              <LogOut style={{ width: 13, height: 13 }} />
            )}
            Log out
          </button>
        </div>
      </nav>
      <NavToast message={message} />
    </>
  );
}
