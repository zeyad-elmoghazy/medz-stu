'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, SpinnerIcon, MailIcon } from '@/components/icons';
import { isDemoMode } from '@/lib/demo-profile';
import { CheckInboxCard } from '@/components/auth/CheckInboxCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'check-email'>('form');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isDemoMode()) {
      setStep('check-email');
      return;
    }

    setLoading(true);

    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/reset-password` },
    );

    setLoading(false);

    // Always show the check-inbox screen, whether or not the email
    // is registered — surfacing "no account found" would let anyone
    // probe which emails have MediZee accounts.
    if (resetError) {
      setError('Something went wrong. Please try again in a moment.');
      return;
    }

    setStep('check-email');
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center px-4 py-16">
      <div
        style={{ padding: '40px' }}
        className="animate-fade-in-up w-full max-w-md rounded-2xl border border-border bg-surface"
      >
        <Link
          href="/"
          className="mx-auto flex w-fit flex-col items-center gap-1.5"
        >
          <span className="text-2xl font-bold tracking-tight text-text-primary">
            MediZee
          </span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-text-muted">
            Adaptive learning
          </span>
        </Link>

        {step === 'check-email' ? (
          <div className="mt-8">
            <CheckInboxCard
              email={email}
              heading="Check your inbox"
              body="If that email has a MediZee account, a reset link is on its way."
              backHref="/login"
              backLabel="Back to log in"
            />
          </div>
        ) : (
          <>
            <div className="mt-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                Reset your password
              </h1>
              <p className="mt-1.5 text-sm text-text-muted">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted"
                >
                  Email
                </label>
                <div className="relative">
                  <MailIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
              </div>

              {error && (
                <p className="animate-fade-in-down rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <SpinnerIcon size={16} className="animate-spin" />
                ) : (
                  <>
                    Send reset link
                    <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-text-muted">
              Remembered it?{' '}
              <Link
                href="/login"
                className="font-medium text-accent underline-offset-2 transition hover:text-text-primary hover:underline"
              >
                Log In
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
