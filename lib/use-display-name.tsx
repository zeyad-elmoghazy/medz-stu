'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';
import { currentAcademicYear } from '@/lib/academic-year';

export type StudentProfileState = {
  /** True once the first fetch has settled (success or failure). */
  loaded: boolean;
  fullName: string;
  /**
   * The student's CURRENT academic year (1–5), derived from what they
   * chose and the September rollover — null if they haven't chosen one.
   */
  academicYear: number | null;
  /**
   * True only when we positively know a signed-in student hasn't picked a
   * year yet. False while loading, when signed out, and when the year
   * columns aren't available — so the prompt never fires on a guess.
   */
  needsAcademicYear: boolean;
  /** Re-fetch after the profile was edited elsewhere (e.g. the profile page). */
  refresh: () => Promise<void>;
};

const NOOP_STATE: StudentProfileState = {
  loaded: false,
  fullName: '',
  academicYear: null,
  needsAcademicYear: false,
  refresh: async () => {},
};

const StudentProfileContext = createContext<StudentProfileState>(NOOP_STATE);

type ProfileSlice = Pick<
  Profile,
  'full_name' | 'academic_year' | 'academic_year_session'
>;

/**
 * Fetches the signed-in student's basic profile once and shares it via
 * context. Mounted in app/(student)/student/layout.tsx, which persists
 * across navigation between /student pages (Next.js keeps a shared
 * layout's component instance mounted across sibling routes) — so the
 * fetch happens once per session instead of once per page. Before this
 * existed, each page's StudentNavbar (or the dashboard's own Navbar)
 * ran this same fetch independently on every mount, starting back at
 * '' and flashing "Guest" on every navigation.
 */
export function DisplayNameProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [fullName, setFullName] = useState('');
  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [needsAcademicYear, setNeedsAcademicYear] = useState(false);

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    let slice: Partial<ProfileSlice> | null = null;
    // Whether the academic-year columns were actually readable.
    let yearColumnsKnown = false;
    try {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        slice = demo
          ? {
              full_name: demo.full_name,
              academic_year: demo.academic_year ?? null,
              academic_year_session: demo.academic_year_session ?? null,
            }
          : null;
        yearColumnsKnown = true;
      } else {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const full = await supabase
            .from('profiles')
            .select('full_name, academic_year, academic_year_session')
            .eq('id', user.id)
            .single();
          if (!full.error) {
            slice = full.data as ProfileSlice | null;
            yearColumnsKnown = true;
          } else {
            // The academic-year columns may not exist yet (app deployed
            // ahead of migration 030) — don't lose the name over it.
            const nameOnly = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .single();
            slice = nameOnly.data as Pick<Profile, 'full_name'> | null;
          }
        }
      }
    } catch {
      /* leave blank on failure */
    }
    if (isCancelled()) return;
    setFullName(slice?.full_name ?? '');
    const year = currentAcademicYear(slice?.academic_year, slice?.academic_year_session);
    setAcademicYear(year);
    setNeedsAcademicYear(slice != null && yearColumnsKnown && year == null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  const value = useMemo<StudentProfileState>(
    () => ({ loaded, fullName, academicYear, needsAcademicYear, refresh }),
    [loaded, fullName, academicYear, needsAcademicYear, refresh]
  );

  return (
    <StudentProfileContext.Provider value={value}>
      {children}
    </StudentProfileContext.Provider>
  );
}

/**
 * The signed-in student's basic profile (name + current academic year).
 * Returns an inert, not-yet-loaded state if no provider is mounted above
 * the caller (e.g. a page outside /student).
 */
export function useStudentProfile(): StudentProfileState {
  return useContext(StudentProfileContext);
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
  return useStudentProfile().fullName;
}
