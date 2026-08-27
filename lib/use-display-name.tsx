'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';

const DisplayNameContext = createContext('');

/**
 * Fetches the signed-in student's display name once and shares it via
 * context. Mounted in app/(student)/student/layout.tsx, which persists
 * across navigation between /student pages (Next.js keeps a shared
 * layout's component instance mounted across sibling routes) — so the
 * fetch happens once per session instead of once per page. Before this
 * existed, each page's StudentNavbar (or the dashboard's own Navbar)
 * ran this same fetch independently on every mount, starting back at
 * '' and flashing "Guest" on every navigation.
 */
export function DisplayNameProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo?.full_name && !cancelled) setDisplayName(demo.full_name);
        return;
      }
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DisplayNameContext.Provider value={displayName}>
      {children}
    </DisplayNameContext.Provider>
  );
}

/**
 * The signed-in student's display name — the demo profile in demo
 * mode, real profiles.full_name otherwise. Reads from the context
 * provided by app/(student)/student/layout.tsx; returns '' if no
 * provider is mounted above the caller (e.g. a page outside
 * /student), same as before this hook had a shared fetch. Callers
 * render their own fallback (e.g. "Guest") for the empty case.
 */
export function useDisplayName(): string {
  return useContext(DisplayNameContext);
}
