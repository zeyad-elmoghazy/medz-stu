import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /auth/confirm?token_hash=...&type=...&next=...
//
// Shared landing point for every Supabase auth email link (signup
// confirmation, password recovery, email change, ...). Verifying the
// token_hash here — server-side, in one shot — is deliberate: the
// alternative (Supabase's default `{{ .ConfirmationURL }}`, which
// issues a one-time PKCE `code` and expects the *browser that
// originally called resetPasswordForEmail/signUp* to exchange it
// client-side) breaks whenever the email is opened in a different
// browser/device than the one that made the original request — the
// code_verifier it needs only exists in that first browser's local
// storage. token_hash verification carries everything it needs in
// the URL itself, so it works regardless of which device opens the
// email. See supabase/templates/{confirmation,recovery}.html, which
// link here instead of using `{{ .ConfirmationURL }}`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  // `next` is attacker-controllable (it's a query param on a public
  // URL), so it must be a same-origin relative path before it's
  // trusted as a redirect target. Without this check, a crafted
  // `next` like "@evil.com/" would make `${origin}${next}` parse as
  // "localhost:3000" userinfo + "evil.com" host — turning a real,
  // signed MediZee verification link into a phishing redirect.
  const rawNext = searchParams.get('next') ?? '/';
  const next =
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.startsWith('/\\')
      ? rawNext
      : '/';

  if (token_hash && type) {
    const supabase = await createRouteHandlerClient<Database>({ cookies });
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  const errorTarget = type === 'recovery' ? '/reset-password' : '/login';
  return NextResponse.redirect(
    new URL(`${errorTarget}?error=invalid_link`, origin),
  );
}
