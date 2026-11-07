import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import { serviceRoleClient } from '@/lib/supabase-service';
import type { Database } from '@/lib/supabase';
import { safeRelativeNext } from '@/lib/safe-redirect';
import {
  SOURCE_COOKIE,
  UTM_COOKIE,
  isSignupSource,
  parseUtmCookie,
} from '@/lib/signup-attribution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A profile this young is a signup that just happened; older ones are a
// returning student and keep whatever attribution they already have.
const NEW_SIGNUP_WINDOW_MS = 10 * 60 * 1000;

// GET /auth/callback?code=...&next=...
//
// Where Google (any OAuth provider) sends the browser back. Unlike
// /auth/confirm, which verifies an emailed token_hash, this exchanges the PKCE
// `code` for a session: the code_verifier lives in a cookie set by the browser
// that started the flow, which is always the one arriving here.
//
// The new profile row (username/year still NULL) was already created by the
// handle_new_auth_user trigger (migration 044); the student layout's
// "Finish setting up" prompts collect the rest.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // `next` is attacker-controllable: same-origin relative paths only.
  const safeNext = safeRelativeNext(searchParams.get('next'), origin);
  const next = safeNext === '/' ? '/student/dashboard' : safeNext;

  // The user cancelled on Google's consent screen, or Google refused.
  if (!code || searchParams.get('error')) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin));
  }

  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin));
  }

  // Attribution is best-effort: it must never block a sign-in.
  const store = await cookies();
  try {
    const source = store.get(SOURCE_COOKIE)?.value;
    const utm = parseUtmCookie(store.get(UTM_COOKIE)?.value);
    const hasUtm = Object.keys(utm).length > 0;
    if (isSignupSource(source) || hasUtm) {
      await untypedFrom(serviceRoleClient())
        .from('profiles')
        .update({
          signup_source: isSignupSource(source) ? source : null,
          signup_utm: hasUtm ? utm : null,
        })
        .eq('id', data.user.id)
        .is('signup_source', null)
        .is('signup_utm', null)
        .gte('created_at', new Date(Date.now() - NEW_SIGNUP_WINDOW_MS).toISOString());
    }
  } catch (err) {
    console.error('[auth/callback] attribution not recorded:', err);
  }
  store.delete(SOURCE_COOKIE);
  store.delete(UTM_COOKIE);

  return NextResponse.redirect(new URL(next, origin));
}
