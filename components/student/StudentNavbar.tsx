'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOutIcon, MoonIcon, SpinnerIcon, SunIcon } from '@/components/icons';
import { MediZeeLogo } from '@/components/brand/MediZeeLogo';
import { useNavToast } from '@/components/ui/use-nav-toast';
import { clearDemoProfile, createBrowserClient, isDemoMode } from '@/lib/supabase';
import { useDisplayName } from '@/lib/use-display-name';
import { useScrollShadow } from '@/lib/use-scroll-shadow';
import { useStudentTheme } from '@/lib/use-student-theme';
import { LinkPending } from '@/components/ui/LinkPending';

// framer-motion lives in this chunk only; load it after hydration, off the critical path.
const NavToast = dynamic(() => import('@/components/ui/NavToast').then((m) => m.NavToast), {
  ssr: false,
});

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
  // Phone/tablet drawer (<=1024px). Desktop never renders it; the
  // menu button and drawer are display:none above that width
  // (see the mz-snav-* rules in app/globals.css).
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useStudentTheme();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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
        className={`mz-nav-scroll mz-snav${scrolled ? ' is-scrolled' : ''}`}
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

        <div
          className="mz-snav-links"
          style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}
        >
          {links.map((link) => {
            if (link.href) {
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{ color: 'var(--text3)', textDecoration: 'none', cursor: 'pointer' }}
                >
                  {link.label}
                  <LinkPending />
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
            className="mz-snav-desk"
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
            <LinkPending />
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="mz-snav-theme"
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
            className="mz-snav-desk"
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
            <LinkPending />
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="mz-snav-desk"
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

          {/* Phone/tablet menu button — display:none above 1024px. */}
          <button
            type="button"
            className="mz-snav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mz-snav-drawer"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <>
            {/* Tap-outside catcher; sits under the drawer inside the nav's stacking context. */}
            <div className="mz-snav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div id="mz-snav-drawer" className="mz-snav-drawer">
              {links.map((link) => {
                if (link.href) {
                  return (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="mz-snav-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                      <LinkPending />
                    </Link>
                  );
                }
                if (link.toast) {
                  return (
                    <button
                      key={link.label}
                      type="button"
                      className="mz-snav-item"
                      onClick={() => {
                        showToast(link.toast!);
                        setMenuOpen(false);
                      }}
                    >
                      {link.label}
                    </button>
                  );
                }
                return (
                  <span
                    key={link.label}
                    className={`mz-snav-item${link.active ? ' is-active' : ''}`}
                    aria-current={link.active ? 'page' : undefined}
                  >
                    {link.label}
                  </span>
                );
              })}
              <Link
                href="/student/dashboard?view=analytics"
                className="mz-snav-item mz-snav-item--accent"
                onClick={() => setMenuOpen(false)}
              >
                My Progress
                <LinkPending />
              </Link>
              <Link
                href="/student/profile"
                className="mz-snav-item"
                onClick={() => setMenuOpen(false)}
              >
                <span className="mz-snav-avatar">{initials || 'ME'}</span>
                <span className="mz-snav-name">{displayName || 'Guest'}</span>
                <LinkPending />
              </Link>
              <button
                type="button"
                className="mz-snav-item"
                onClick={handleLogout}
                disabled={signingOut}
              >
                {signingOut ? (
                  <SpinnerIcon size={15} className="animate-spin" />
                ) : (
                  <LogOutIcon size={15} />
                )}
                Log out
              </button>
            </div>
          </>
        )}
      </nav>
      <NavToast message={message} />
    </>
  );
}
