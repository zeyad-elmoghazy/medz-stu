'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOutIcon, MoonIcon, SpinnerIcon, SunIcon } from '@/components/icons';
import { MediZeeLogo } from '@/components/brand/MediZeeLogo';
import { NavToast, useNavToast } from '@/components/ui/NavToast';
import { clearDemoProfile, createBrowserClient, isDemoMode } from '@/lib/supabase';
import { useDisplayName } from '@/lib/use-display-name';
import { useScrollShadow } from '@/lib/use-scroll-shadow';
import { useStudentTheme } from '@/lib/use-student-theme';

// Single source of truth for the student top bar. Every /student
// page renders this so the header stays identical.

type NavLink = { label: string; href?: string; active?: boolean; toast?: string };

const DEFAULT_LINKS: NavLink[] = [
  { label: 'Home',         href: '/student/dashboard' },
  { label: 'Catalogue',    href: '/student/catalogue' },
  { label: 'Custom Exam',  href: '/student/exam' },
  { label: 'Leaderboard',  href: '/student/leaderboard' },
  { label: 'Bookmarks',    href: '/student/bookmarks' },
];

export function StudentNavbar({ activeLabel }: { activeLabel?: NavLink['label'] }) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const { message, showToast } = useNavToast();

  const displayName = useDisplayName();
  const [signingOut, setSigningOut] = useState(false);
  const { theme, toggleTheme } = useStudentTheme();

  // Sticky header with a subtle background/shadow that fades in once the
  // page has scrolled — same treatment as dashboard's inline Navbar.
  const scrolled = useScrollShadow();

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
        className={`mz-nav-scroll${scrolled ? ' is-scrolled' : ''}`}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 34px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <MediZeeLogo size="sm" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}>
          {links.map((link) => {
            if (link.href) {
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{ color: 'var(--text3)', textDecoration: 'none', cursor: 'pointer' }}
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
                    color: 'var(--text3)',
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
                  color: link.active ? 'var(--text)' : 'var(--text3)',
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
              color: '#F7F9FA',
              background: 'var(--accent-text)',
              padding: '9px 16px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            My Progress
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: '1px solid var(--line2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text3)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {theme === 'light' ? <MoonIcon size={15} /> : <SunIcon size={15} />}
          </button>

          <Link
            href="/student/profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--text3)',
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
                background: 'var(--accent-text)',
                color: '#F7F9FA',
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
              color: 'var(--text3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {signingOut ? (
              <SpinnerIcon size={13} className="animate-spin" />
            ) : (
              <LogOutIcon size={13} />
            )}
            Log out
          </button>
        </div>
      </nav>
      <NavToast message={message} />
    </>
  );
}
