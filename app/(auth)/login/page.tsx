'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon, SpinnerIcon, MailIcon, LockIcon } from '@/components/icons';
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
  // /login is statically prerendered and this component renders
  // client-only (see the Suspense boundary in LoginPage below), so
  // there's no server-rendered content to hydrate against — reading
  // searchParams in a lazy initializer is safe here, unlike the
  // localStorage-backed cases elsewhere in this pass.
  const [error, setError] = useState<string | null>(() =>
    searchParams.get('error') === 'missing_profile'
      ? 'Your profile could not be loaded. Please sign up again or contact support.'
      : null
  );
  const [info] = useState<string | null>(() =>
    searchParams.get('reset') === 'success'
      ? 'Password updated. Log in with your new password.'
      : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isDemoMode()) {
      const existing = readDemoProfile();
      const role: UserRole =
        existing && existing.email === email ? existing.role : inferRoleFromEmail(email);
      writeDemoProfile({
        id:
          existing && existing.email === email
            ? existing.id
            : `demo-${Date.now()}`,
        full_name:
          existing && existing.email === email
            ? existing.full_name
            : email.split('@')[0] ?? 'Demo User',
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
            Exam prep, structured.
          </span>
        </Link>

        <div className="mt-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Sign in to continue your block.
          </p>
          {info && (
            <p className="animate-fade-in-down mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              {info}
            </p>
          )}
          {isDemoMode() && (
            <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-text-muted underline-offset-2 transition hover:text-accent hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <LockIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
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
            className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <SpinnerIcon size={16} className="animate-spin" />
            ) : (
              <>
                Log In
                <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-muted">
          New to MediZee?{' '}
          <Link
            href="/signup"
            className="font-medium text-accent underline-offset-2 transition hover:text-text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
