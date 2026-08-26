'use client';

import { useEffect, useState } from 'react';
import {
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';

/**
 * The signed-in student's display name — the demo profile in demo
 * mode, real profiles.full_name otherwise. Shared by StudentNavbar
 * and the dashboard's own Navbar, which each fetched this
 * independently before this hook existed. Returns '' until the
 * fetch resolves (or forever, if it fails) — callers render their
 * own fallback (e.g. "Guest") for that case, this hook doesn't
 * pick one.
 */
export function useDisplayName(): string {
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

  return displayName;
}
