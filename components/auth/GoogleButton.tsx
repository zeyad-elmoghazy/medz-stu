'use client';

import { useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { isDemoMode } from '@/lib/demo-profile';
import { SOURCE_COOKIE, SOURCE_COOKIE_MAX_AGE, type SignupSource } from '@/lib/signup-attribution';

/**
 * Off unless NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1. The code can ship before the
 * Google provider is switched on in the Supabase dashboard; flipping the flag
 * (and redeploying) is what makes the button appear.
 */
export const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === '1';

/**
 * "Continue with Google". The OAuth redirect cannot carry user metadata, so
 * the signup page's "how did you hear" answer rides in a short-lived cookie
 * that /auth/callback reads once the session exists.
 */
export function GoogleButton({
  label = 'Continue with Google',
  source = null,
  next = '/student/dashboard',
}: {
  label?: string;
  source?: SignupSource | null;
  /** Same-origin path to land on after sign-in (re-checked by the callback). */
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!GOOGLE_AUTH_ENABLED || isDemoMode()) return null;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    document.cookie = source
      ? `${SOURCE_COOKIE}=${source}; path=/; max-age=${SOURCE_COOKIE_MAX_AGE}; samesite=lax`
      : `${SOURCE_COOKIE}=; path=/; max-age=0; samesite=lax`;

    const { createBrowserClient } = await import('@/lib/supabase');
    const { error: oauthError } = await createBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser is already navigating to Google.
    if (oauthError) {
      setBusy(false);
      setError("Couldn't start Google sign-in. Try again, or use your email.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background px-6 text-sm font-semibold text-text-primary transition hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <SpinnerIcon size={16} className="animate-spin" /> : <GoogleG />}
        {label}
      </button>
      {error && (
        <p role="alert" className="text-center text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Divider between the Google button and the email form. */
export function OrDivider() {
  if (!GOOGLE_AUTH_ENABLED || isDemoMode()) return null;
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
