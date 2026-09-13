'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'mz-theme';

// Key the profile page's old "Dark theme" switch wrote to
// (app/(student)/student/profile/page.tsx) — a JSON blob shared with
// unrelated prefs (email/reminder notifications), so it's read once
// as a fallback seed below and never written to or deleted here.
const LEGACY_PREFS_KEY = 'medz.studentPrefs';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
};

const StudentThemeContext = createContext<ThemeContextValue | null>(null);

function readLegacyTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(LEGACY_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { theme?: unknown };
    return parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : null;
  } catch {
    return null;
  }
}

/**
 * Theme provider for the /student route group. Mirrors the pattern
 * already shipped on the landing page (app/page.tsx) — same
 * localStorage key ('mz-theme'), same dark-until-hydrated handling —
 * so both surfaces share one saved preference and one token
 * definition (app/globals.css) instead of two independent copies.
 *
 * Mounted in app/(student)/student/layout.tsx, alongside
 * DisplayNameProvider. Wraps children in a [data-mz-root] div so the
 * html[data-mz-theme] token blocks in app/globals.css become
 * available to every /student page — pages still have to actually
 * consume var(--token) in their own styles for anything to visibly
 * change; this provider only makes that possible, it doesn't migrate
 * any page's colors itself.
 */
export function StudentThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  // localStorage isn't available during SSR, so the saved theme can
  // only be read post-mount — same constraint app/page.tsx's own
  // mount effect documents. The anti-flash inline script in
  // app/layout.tsx's <head> has already applied the saved value to
  // <html> before first paint, so there's no flash even though this
  // effect (which syncs React state, for this provider's own
  // consumers) only runs after mount.
  useEffect(() => {
    let saved: Theme | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark') saved = raw;
    } catch {
      /* localStorage may be blocked; fall through to legacy/default */
    }

    // One-time migration: the profile page's old "Dark theme" switch
    // wrote into medz.studentPrefs and never applied it anywhere. If
    // mz-theme has never been set, seed it from that legacy value so
    // a student who'd already flipped that switch doesn't see their
    // choice silently reset back to dark. Only read, never delete —
    // other prefs still live in that object.
    if (saved === null) {
      const legacy = readLegacyTheme();
      if (legacy) {
        saved = legacy;
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
        } catch {
          /* localStorage may be blocked; state still updates below */
        }
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(saved ?? 'dark');
  }, []);

  // Keep <html>'s theme attribute (set pre-paint by the inline
  // script in app/layout.tsx) in sync with this provider's state,
  // the same way app/page.tsx syncs its own state to it. Whichever
  // [data-mz-root] surface changed last "wins" for the single
  // shared <html> attribute — expected, since both write the same
  // localStorage key and are meant to represent one preference.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mzTheme = theme;
    }
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage may be blocked; UI still updates via state */
    }
  }

  function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  return (
    <StudentThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div data-mz-root>{children}</div>
    </StudentThemeContext.Provider>
  );
}

/**
 * Reads the shared /student theme plus its setters. Throws outside
 * StudentThemeProvider (mounted in app/(student)/student/layout.tsx)
 * — unlike useDisplayName's silent '' fallback, callers here need
 * real setters, and a toggle button that silently no-ops is exactly
 * the bug this provider exists to fix.
 */
export function useStudentTheme(): ThemeContextValue {
  const ctx = useContext(StudentThemeContext);
  if (!ctx) {
    throw new Error('useStudentTheme must be used within StudentThemeProvider');
  }
  return ctx;
}
