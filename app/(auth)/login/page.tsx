'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, Mail, Lock } from 'lucide-react';
import {
  dashboardPathForRole,
  inferRoleFromEmail,
  isDemoMode,
  readDemoProfile,
  writeDemoProfile,
  type UserRole,
} from '@/lib/demo-profile';

export default function LoginPage() {
  // useSearchParams must live inside a Suspense boundary so the page
  // can be statically prerendered (Next 14.2+ requirement).
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialError = searchParams.get('error');
    if (initialError === 'missing_profile') {
      setError('Your profile could not be loaded. Please sign up again or contact support.');
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isDemoMode()) {
      const existing = readDemoProfile();
      const role: UserRole =
        existing && existing.email === email ? existing.role : inferRoleFromEmail(email);
      writeDemoProfile({
        id: existing?.id ?? `demo-${Date.now()}`,
        full_name: existing?.full_name ?? email.split('@')[0] ?? 'Demo User',
        email,
        role,
      });
      router.push(dashboardPathForRole(role));
      router.refresh();
      return;
    }

    // Defer the ~90 KB supabase-js payload until the user actually
    // submits the form. Keeps First Load JS on /login tiny.
    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setLoading(false);
      setError(signInError?.message ?? 'Unable to sign in. Check your credentials.');
      return;
    }

    const profileQuery = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const profile = profileQuery.data as { role: UserRole } | null;

    if (profileQuery.error || !profile) {
      setLoading(false);
      setError('Signed in, but your role could not be loaded. Contact your administrator.');
      return;
    }

    // Always land on the role's home page after sign-in — the
    // previous `redirectedFrom` follow-through meant students who
    // hit /student/subjects while logged out came back to subjects
    // instead of the dashboard. If deep-link-after-auth is needed
    // later (e.g. shared quiz links), reintroduce it behind an
    // allowlist of paths.
    router.push(dashboardPathForRole(profile.role));
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <div
        style={{
          backgroundColor: '#0F0F1A',
          border: '1px solid #1E1E2E',
          padding: '40px',
        }}
        className="animate-fade-in-up w-full max-w-md rounded-2xl shadow-[0_40px_120px_-30px_rgba(124,58,237,0.4)]"
      >
        <Link
          href="/"
          className="mx-auto flex w-fit flex-col items-center gap-1.5"
        >
          <span
            className="text-2xl font-bold tracking-tight text-white"
            style={{ textShadow: '0 0 20px rgba(124,58,237,0.7)' }}
          >
            MedZ
          </span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-text-muted">
            Adaptive learning
          </span>
        </Link>

        <div className="mt-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Sign in to continue your block.
          </p>
          {isDemoMode() && (
            <p
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-violet-200"
              style={{
                backgroundColor: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(159,103,255,0.35)',
              }}
            >
              Demo mode · any password works
            </p>
          )}
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
                className="block h-11 w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A12] pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted"
              >
                Password
              </label>
              <Link
                href="#"
                className="text-xs text-text-muted underline-offset-2 transition hover:text-violet-300 hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A12] pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          {error && (
            <p
              className="animate-fade-in-down rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-6 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,58,237,0.45)] transition hover:bg-violet-500 hover:shadow-[0_0_36px_rgba(124,58,237,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0F1A] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Log In
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-muted">
          New to MedZ?{' '}
          <Link
            href="/signup"
            className="font-medium text-violet-300 underline-offset-2 transition hover:text-violet-200 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
