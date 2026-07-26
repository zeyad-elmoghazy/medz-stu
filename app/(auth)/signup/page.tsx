'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import {
  dashboardPathForRole,
  isDemoMode,
  writeDemoProfile,
} from '@/lib/demo-profile';

type SelectableRole = 'student';

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const role: SelectableRole = 'student';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    if (isDemoMode()) {
      writeDemoProfile({
        id: `demo-${Date.now()}`,
        full_name: fullName,
        email,
        role,
      });
      router.push(dashboardPathForRole(role));
      router.refresh();
      return;
    }

    // Defer supabase-js (~90 KB) until the user actually submits.
    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    });

    if (signUpError || !data.user) {
      setLoading(false);
      setError(signUpError?.message ?? 'Unable to create account.');
      return;
    }

    // The DB trigger `on_auth_user_created` inserts the matching
    // profiles row using auth.users.raw_user_meta_data, so no
    // client-side INSERT is needed here. This upsert is a belt-
    // and-suspenders: if the trigger is disabled for some reason,
    // we still get a profile row; if it already ran, ignoreDuplicates
    // makes this a no-op.
    const upsertResult = await (
      supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string; ignoreDuplicates: boolean }
          ) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .from('profiles')
      .upsert(
        { id: data.user.id, full_name: fullName, email, role },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    const profileError = upsertResult.error;

    // Swallow RLS violations (42501) — the trigger will have
    // already created the row, so we don't need the client insert
    // to succeed. Any OTHER error is worth surfacing.
    if (profileError && !/row-level security/i.test(profileError.message)) {
      setLoading(false);
      setError(`Account created, but profile failed: ${profileError.message}`);
      return;
    }

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setLoading(false);
        setError('Account created. Please confirm your email, then log in.');
        return;
      }
    }

    router.push(dashboardPathForRole(role));
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
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
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Start drilling MCQs, generating exams, and tracking your streaks.
          </p>
          {isDemoMode() && (
            <p
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-violet-200"
              style={{
                backgroundColor: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(159,103,255,0.35)',
              }}
            >
              Demo mode · no real account required
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <FormField
            id="fullName"
            label="Full name"
            icon={<User className="h-4 w-4" />}
            type="text"
            autoComplete="name"
            placeholder="Yusuf Khalil"
            value={fullName}
            onChange={setFullName}
          />

          <FormField
            id="email"
            label="Email"
            icon={<Mail className="h-4 w-4" />}
            type="email"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={setEmail}
          />

          <FormField
            id="password"
            label="Password"
            icon={<Lock className="h-4 w-4" />}
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={setPassword}
            minLength={8}
          />

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
                Create account
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-violet-300 underline-offset-2 transition hover:text-violet-200 hover:underline"
          >
            Log In
          </Link>
        </p>
      </div>
    </main>
  );
}

function FormField({
  id,
  label,
  icon,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  minLength,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  type: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block h-11 w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A12] pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>
    </div>
  );
}

