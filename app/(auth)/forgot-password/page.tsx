'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Mail } from 'lucide-react';
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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#33BFBF]/15 blur-[120px]" />
        <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <div
        style={{
          backgroundColor: '#132B45',
          border: '1px solid #132B45',
          padding: '40px',
        }}
        className="animate-fade-in-up w-full max-w-md rounded-2xl shadow-[0_40px_120px_-30px_rgba(0,166,166,0.4)]"
      >
        <Link
          href="/"
          className="mx-auto flex w-fit flex-col items-center gap-1.5"
        >
          <span
            className="text-2xl font-bold tracking-tight text-white"
            style={{ textShadow: '0 0 20px rgba(0,166,166,0.7)' }}
          >
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
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block h-11 w-full rounded-lg border border-[#132B45] bg-[#0B1F33] pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-[#33BFBF] focus:outline-none focus:ring-2 focus:ring-[#33BFBF]/40"
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
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#00A6A6] px-6 text-sm font-semibold text-white shadow-[0_0_24px_rgba(0,166,166,0.45)] transition hover:bg-[#33BFBF] hover:shadow-[0_0_36px_rgba(0,166,166,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#33BFBF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#132B45] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Send reset link
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-text-muted">
              Remembered it?{' '}
              <Link
                href="/login"
                className="font-medium text-[#33BFBF] underline-offset-2 transition hover:text-[#F7F9FA] hover:underline"
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
