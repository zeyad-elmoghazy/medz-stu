import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { authLimiter } from '@/lib/rate-limit';
import { passwordChangeSchema } from '@/lib/profile-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/profile/password  { current, next }
 *
 * Change-password for a signed-in student. The current password is
 * re-verified first so a hijacked-but-idle session can't silently take
 * over the account. Shares the login limiter (5 attempts / 15 min), since
 * this endpoint is also a password-guessing oracle.
 */
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: 'This account has no email/password login' },
      { status: 400 }
    );
  }

  const limited = await applyRateLimit(request, authLimiter, user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = passwordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    );
  }

  const verify = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (verify.error) {
    return NextResponse.json({ error: 'Your current password is incorrect' }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) {
    // Auth-service messages here are user-facing and safe (e.g. weak
    // password, same-as-old).
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
