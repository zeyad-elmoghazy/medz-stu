import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Ratelimit } from '@upstash/ratelimit';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database, UserRole } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { chunk } from '@/lib/server/custom-exam';

/**
 * Shared plumbing for /api/student/custom-exam/** — auth, the
 * service-role client, and the DB reads that more than one route needs.
 * The chapter-quiz routes keep private copies of the first two; this is
 * a separate file so those live routes stay untouched.
 */

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export type RouteSupabase = Awaited<ReturnType<typeof createRouteHandlerClient<Database>>>;

// Discriminated on `error` so callers narrow with `if (auth.error)`.
export type StudentAuth =
  | { error: NextResponse }
  | { error: null; supabase: RouteSupabase; user: { id: string } };

/** Signed-in student only; optionally rate limited per user. */
export async function authenticateStudent(
  request: NextRequest,
  limiter: Ratelimit | null
): Promise<StudentAuth> {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const profileQuery = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileQuery.data as { role: UserRole } | null;
  if (profile?.role !== 'student') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (limiter) {
    const limited = await applyRateLimit(request, limiter, user.id);
    if (limited) return { error: limited };
  }

  return { error: null, supabase, user };
}

/**
 * Minimum surface of the service-role client these routes use. Untyped
 * on purpose — same stack limitation as `untypedFrom` (see
 * lib/supabase-server.ts) — with `rpc` added for record_quiz_result.
 */
export type ServiceClient = {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{
    data: { xp_earned: number; eligible_correct_count: number }[] | null;
    error: { message: string } | null;
  }>;
};

/** Service-role client (bypasses RLS) — every use must scope by the caller's id. */
export function serviceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ServiceClient;
}

/** A row of custom_exam_progress (supabase/migrations/035). */
export type ExamRow = {
  id: string;
  student_id: string;
  module_code: string;
  chapter_ids: string[];
  question_ids: number[];
  answers: Record<string, string> | null;
  current_question_index: number;
  total_questions: number;
  started_at: string;
  updated_at: string;
};

export const EXAM_ROW_COLUMNS =
  'id, student_id, module_code, chapter_ids, question_ids, answers, current_question_index, total_questions, started_at, updated_at';

/**
 * The unfinished exam with this id — but only if it belongs to
 * `studentId`. A missing row and someone else's row are deliberately
 * indistinguishable to the caller (both `exam: null`).
 */
export async function loadOwnedExam(
  service: ServiceClient,
  studentId: string,
  examId: string
): Promise<{ exam: ExamRow | null; error: string | null }> {
  const res = await service
    .from('custom_exam_progress')
    .select(EXAM_ROW_COLUMNS)
    .eq('id', examId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (res.error) return { exam: null, error: res.error.message as string };
  return { exam: (res.data as ExamRow | null) ?? null, error: null };
}

// PostgREST caps a response at `max_rows` (1000 by default) and
// truncates silently, so anything that can exceed it is paged.
const PAGE_SIZE = 1000;
// Keep `IN (...)` lists short — long UUID lists blow URL limits.
const CHAPTER_CHUNK = 40;
const ID_CHUNK = 150;

/**
 * Every PUBLISHED question id in the given chapters, with the chapter it
 * belongs to. This is the pool an exam is drawn from and the number the
 * "maximum available" check is made against. Paged + chunked so a large
 * module can't be silently truncated at 1000 rows.
 */
export async function fetchPublishedPool(
  service: ServiceClient,
  chapterIds: string[]
): Promise<{ pool: { id: number; chapterId: string }[]; error: string | null }> {
  const pool: { id: number; chapterId: string }[] = [];
  for (const ids of chunk(chapterIds, CHAPTER_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await service
        .from('questions')
        .select('id, chapter_id')
        .in('chapter_id', ids)
        .eq('status', 'published')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (res.error) return { pool: [], error: res.error.message as string };
      const rows = (res.data ?? []) as { id: number; chapter_id: string }[];
      for (const r of rows) pool.push({ id: r.id, chapterId: r.chapter_id });
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return { pool, error: null };
}

/**
 * Published questions by id (arbitrary order — callers re-order with
 * `orderByIds`). A question unpublished since the exam was drawn is
 * simply absent from the result.
 */
export async function fetchPublishedQuestionsByIds<T extends { id: number }>(
  service: ServiceClient,
  ids: number[],
  columns: string
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    const res = await service
      .from('questions')
      .select(columns)
      .in('id', part)
      .eq('status', 'published');
    if (res.error) return { rows: [], error: res.error.message as string };
    rows.push(...((res.data ?? []) as T[]));
  }
  return { rows, error: null };
}
