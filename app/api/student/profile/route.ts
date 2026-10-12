import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { academicSession } from '@/lib/academic-year';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { apiLimiter, authLimiter } from '@/lib/rate-limit';
import { deleteAccountSchema, profilePatchSchema } from '@/lib/profile-schema';
import {
  PROFILE_COLUMNS,
  toProfileDto,
  type ProfileRow,
  type StudentBadge,
} from '@/lib/student-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteClient = Awaited<ReturnType<typeof createRouteHandlerClient<Database>>>;

/**
 * Resolves the signed-in student, or the error response to return.
 * Admins are rejected: this surface is the student self-service profile.
 */
async function requireStudent(
  supabase: RouteClient
): Promise<
  | { ok: true; user: { id: string; email: string | null }; row: ProfileRow }
  | { ok: false; response: NextResponse }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data, error } = await untypedFrom(supabase)
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .single();
  const row = data as ProfileRow | null;
  if (error || !row) {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
  }
  if (row.role !== 'student') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null }, row };
}

async function fetchBadges(supabase: RouteClient, studentId: string): Promise<StudentBadge[]> {
  const { data } = await untypedFrom(supabase)
    .from('badges')
    .select('badge_type, earned_at')
    .eq('student_id', studentId)
    .order('earned_at', { ascending: false });
  return ((data ?? []) as Array<{ badge_type: string; earned_at: string }>).map((b) => ({
    type: b.badge_type,
    earnedAt: b.earned_at,
  }));
}

/** GET /api/student/profile — the caller's own profile, prefs and badges. */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const auth = await requireStudent(supabase);
  if (!auth.ok) return auth.response;

  const badges = await fetchBadges(supabase, auth.user.id);
  return NextResponse.json(toProfileDto(auth.row, badges), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * PATCH /api/student/profile
 *
 * The only path the UI uses to write `profiles`. The body is a strict
 * allow-list (see lib/profile-schema.ts) because the table's RLS update
 * policy doesn't restrict columns. Changing `academic_year` re-baselines
 * it: the session is stamped server-side from the current date.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const auth = await requireStudent(supabase);
  if (!auth.ok) return auth.response;

  const limited = await applyRateLimit(request, apiLimiter, auth.user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    );
  }

  const { academic_year, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (academic_year !== undefined) {
    update.academic_year = academic_year;
    update.academic_year_session = academicSession();
  }

  const { data, error } = await untypedFrom(supabase)
    .from('profiles')
    .update(update)
    .eq('id', auth.user.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    // 23505 = unique_violation (profiles.username is unique).
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 });
    }
    console.error('[profile PATCH]', error.code, error.message);
    return NextResponse.json({ error: 'Could not save your profile' }, { status: 500 });
  }

  const badges = await fetchBadges(supabase, auth.user.id);
  return NextResponse.json(toProfileDto(data as ProfileRow, badges), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * DELETE /api/student/profile — permanently deletes the caller's account.
 *
 * The student must retype their email. Deleting the auth user cascades to
 * `profiles` and every student-owned table (quiz_sessions, bookmarks,
 * notes, daily_streaks, badges, …) via ON DELETE CASCADE.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const auth = await requireStudent(supabase);
  if (!auth.ok) return auth.response;

  const limited = await applyRateLimit(request, authLimiter, auth.user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    );
  }

  const email = auth.user.email;
  if (!email || parsed.data.confirm.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { error: 'The email you typed does not match your account' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[profile DELETE] service-role env vars missing');
    return NextResponse.json({ error: 'Account deletion is unavailable' }, { status: 500 });
  }
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) {
    console.error('[profile DELETE]', error.message);
    return NextResponse.json({ error: 'Could not delete your account' }, { status: 500 });
  }

  // The session is now orphaned; clear the cookies (best effort).
  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
