/*
================================================================================
  MedZ — Supabase schema
  Run this in the Supabase SQL editor before using auth flows.
================================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT,
  role TEXT CHECK (role IN ('student', 'professor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: a user may read & update their own profile row.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by owner"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Profiles are insertable by owner"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles are updatable by owner"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admin role is NOT selectable in the signup form — promote manually:
--   UPDATE profiles SET role = 'admin' WHERE email = 'you@university.edu';

================================================================================
*/

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createBrowserClient as createBrowserSSR,
  createServerClient as createServerSSR,
} from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const demoFlag = process.env.NEXT_PUBLIC_DEMO === '1';

if ((!supabaseUrl || !supabaseAnonKey) && !demoFlag) {
  // Not in explicit demo mode and Supabase creds are missing: fail
  // loud. A silent fallback to localStorage-auth is exactly the
  // kind of misconfiguration that ships to prod unnoticed.
  const message =
    '[MedZ] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.local.example, or set NEXT_PUBLIC_DEMO=1 to run in demo mode.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  // eslint-disable-next-line no-console
  console.warn(message);
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Cache the browser client across React renders. Minting a fresh client
// every call invalidates referential-equality checks in `useEffect` deps
// and doubles up auth-state subscriptions. One process-wide instance is
// fine — it reads its session from cookies on demand, so there is no
// state to reset.
type BrowserClient = ReturnType<typeof createBrowserSSR<Database>>;
let browserClient: BrowserClient | null = null;
export const createBrowserClient = (): BrowserClient => {
  if (typeof window === 'undefined') {
    return createBrowserSSR<Database>(supabaseUrl, supabaseAnonKey);
  }
  if (!browserClient) {
    browserClient = createBrowserSSR<Database>(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
};

// `createRouteHandlerClient` lives in `./supabase-server` — it depends
// on `next/headers`, which Next 16 refuses to bundle into client-facing
// modules. Import server-only helpers from that file directly:
//     import { createRouteHandlerClient } from '@/lib/supabase-server';

export const createMiddlewareSupabase = (
  req: NextRequest,
  res: NextResponse,
): SupabaseClient<Database> =>
  createServerSSR<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        });
      },
    },
  });

export type { UserRole } from '@/lib/demo-profile';
import type { UserRole } from '@/lib/demo-profile';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
};

type QuizSessionRow = {
  id: string;
  student_id: string;
  subject_id: string;
  answers: Record<string, unknown>;
  score: number;
  total_questions: number;
  accuracy: number;
  violations_count: number;
  completed_at: string;
};

type DailyStreakRow = {
  id: string;
  student_id: string;
  streak_date: string;
  challenges_completed: number;
};

type BookmarkRow = {
  id: string;
  student_id: string;
  question_id: number;
  subject_id: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  student_id: string;
  question_id: number;
  subject_id: string;
  content: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  professor_id: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type StudentSubjectStatsRow = {
  student_id: string;
  subject_id: string;
  total_sessions: number;
  total_correct: number;
  total_answered: number;
  avg_accuracy: number;
  best_accuracy: number;
  last_attempted: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: UserRole;
          created_at?: string;
        };
        Update: Partial<Profile>;
      };
      quiz_sessions: {
        Row: QuizSessionRow;
        Insert: Partial<QuizSessionRow> & {
          student_id: string;
          subject_id: string;
        };
        Update: Partial<QuizSessionRow>;
      };
      daily_streaks: {
        Row: DailyStreakRow;
        Insert: Partial<DailyStreakRow> & {
          student_id: string;
          streak_date: string;
        };
        Update: Partial<DailyStreakRow>;
      };
      bookmarks: {
        Row: BookmarkRow;
        Insert: Partial<BookmarkRow> & {
          student_id: string;
          question_id: number;
          subject_id: string;
        };
        Update: Partial<BookmarkRow>;
      };
      notes: {
        Row: NoteRow;
        Insert: Partial<NoteRow> & {
          student_id: string;
          question_id: number;
          subject_id: string;
        };
        Update: Partial<NoteRow>;
      };
      jobs: {
        Row: JobRow;
        Insert: Partial<JobRow> & {
          id: string;
          professor_id: string;
          type: string;
        };
        Update: Partial<JobRow>;
      };
      student_subject_stats: {
        Row: StudentSubjectStatsRow;
        Insert: never;
        Update: never;
      };
    };
    Functions: {
      get_student_streak: {
        Args: { p_student_id: string };
        Returns: number;
      };
    };
  };
};

// Re-exports for backward compatibility. Prefer importing directly
// from '@/lib/demo-profile' — that path has zero supabase-js deps,
// which lets webpack tree-shake the ~90 KB @supabase/* module tree
// out of routes that only need the demo helpers.
export {
  dashboardPathForRole,
  isDemoMode,
  readDemoProfile,
  writeDemoProfile,
  clearDemoProfile,
  inferRoleFromEmail,
  DEMO_PROFILE_KEY,
  type DemoProfile,
} from '@/lib/demo-profile';
