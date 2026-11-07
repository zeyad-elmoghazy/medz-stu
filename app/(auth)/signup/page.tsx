'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ListIcon,
  SpinnerIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from '@/components/icons';
import {
  dashboardPathForRole,
  isDemoMode,
  writeDemoProfile,
} from '@/lib/demo-profile';
import { GoogleButton, OrDivider } from '@/components/auth/GoogleButton';
import { CheckInboxCard, type ResendResult } from '@/components/auth/CheckInboxCard';
import {
  ACADEMIC_YEARS,
  academicSession,
  formatAcademicYear,
  isValidAcademicYear,
} from '@/lib/academic-year';
import { normalizeUsername, validateUsername } from '@/lib/username';
import { applyDomainSuggestion, suggestEmailDomain } from '@/lib/email-typo';
import {
  SIGNUP_SOURCES,
  SIGNUP_SOURCE_LABELS,
  UTM_COOKIE,
  parseUtmCookie,
  readCookie,
  type SignupSource,
} from '@/lib/signup-attribution';
import {
  fetchUsernameAvailability,
  useUsernameAvailability,
  type UsernameCheck,
} from '@/lib/use-username-availability';

type SelectableRole = 'student';

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const liveUsernameCheck = useUsernameAvailability(username);
  // A name can be free while the student types and taken by the time they
  // submit. When the signup is refused for that, the field must say so
  // too, instead of still reading "Available" next to the error banner.
  const [rejectedUsername, setRejectedUsername] = useState<{ name: string; message: string } | null>(
    null
  );
  const usernameCheck: UsernameCheck =
    rejectedUsername && rejectedUsername.name === normalizeUsername(username)
      ? { status: 'unavailable', message: rejectedUsername.message }
      : liveUsernameCheck;
  const [email, setEmail] = useState('');
  // Advisory only (never blocks submit): set when the email field loses
  // focus with a domain that looks like a typo, e.g. gmail.con.
  const [domainSuggestion, setDomainSuggestion] = useState<string | null>(null);
  const [signupSource, setSignupSource] = useState<SignupSource | null>(null);
  const [password, setPassword] = useState('');
  // Kept as the raw <select> value; '' means "not chosen yet".
  const [academicYear, setAcademicYear] = useState('');
  const role: SelectableRole = 'student';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'check-email'>('form');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const chosenUsername = normalizeUsername(username);
    const usernameProblem = validateUsername(chosenUsername);
    if (usernameProblem) {
      setError(usernameProblem);
      return;
    }
    if (usernameCheck.status === 'unavailable') {
      setError(usernameCheck.message);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    const chosenYear = Number(academicYear);
    if (!isValidAcademicYear(chosenYear)) {
      setError('Please select the academic year you are in.');
      return;
    }

    setLoading(true);

    if (isDemoMode()) {
      writeDemoProfile({
        id: `demo-${Date.now()}`,
        full_name: fullName,
        username: chosenUsername,
        email,
        role,
        academic_year: chosenYear,
        academic_year_session: academicSession(),
      });
      router.push(dashboardPathForRole(role));
      router.refresh();
      return;
    }

    // Defer supabase-js (~90 KB) until the user actually submits.
    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();

    // First-touch utm_* params, remembered by proxy.ts when the student
    // landed from a campaign link. The trigger re-validates both.
    const utm = parseUtmCookie(readCookie(UTM_COOKIE, document.cookie));

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // The on_auth_user_created trigger validates `academic_year`
        // (1–5) and `username` (migrations 030, 039, 040) and stamps the
        // session; `role` is ignored server-side (migration 030) and only
        // kept for the client-side fallback.
        data: {
          full_name: fullName,
          username: chosenUsername,
          role,
          academic_year: chosenYear,
          ...(signupSource ? { signup_source: signupSource } : {}),
          ...(Object.keys(utm).length > 0 ? { signup_utm: utm } : {}),
        },
      },
    });

    if (signUpError || !data.user) {
      setLoading(false);
      // GoTrue reduces any failure inside the signup trigger to the generic
      // "Database error saving new user", so a username someone else
      // registered in the meantime would look like an unexplained failure.
      // Re-check it to give the student an actionable message.
      const recheck = await fetchUsernameAvailability(chosenUsername);
      if (recheck.status === 'unavailable') {
        setRejectedUsername({ name: chosenUsername, message: recheck.message });
        setError(recheck.message);
      } else {
        setError(signUpError?.message ?? 'Unable to create account.');
      }
      return;
    }

    // The DB trigger `on_auth_user_created` creates the matching
    // profiles row from auth.users.raw_user_meta_data (migration 030).
    // There is deliberately NO client-side insert: students can't
    // create or edit protected profile data through the API
    // (migration 031), and the trigger is the single creator.

    if (!data.session) {
      // No session yet means email confirmation is required (the
      // normal case in production) — this isn't an error, so show
      // the check-inbox screen instead of routing to the dashboard.
      setLoading(false);
      setStep('check-email');
      return;
    }

    router.push(dashboardPathForRole(role));
    router.refresh();
  }

  async function resendConfirmation(): Promise<ResendResult> {
    const { createBrowserClient } = await import('@/lib/supabase');
    const { error: resendError } = await createBrowserClient().auth.resend({
      type: 'signup',
      email,
    });
    return {
      error: resendError
        ? 'Could not resend yet. Wait a minute and try again.'
        : null,
    };
  }

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center px-4 py-16">
      <div
        className="animate-fade-in-up w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-10"
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

        {step === 'check-email' ? (
          <div className="mt-8">
            <CheckInboxCard
              email={email}
              heading="Check your inbox"
              body="Your account is created — you just need to confirm it."
              backHref="/login"
              backLabel="Back to log in"
              onResend={resendConfirmation}
            />
          </div>
        ) : (
          <>
            <div className="mt-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                Create your account
              </h1>
              <p className="mt-1.5 text-sm text-text-muted">
                Start drilling MCQs, generating exams, and tracking your streaks.
              </p>
              {isDemoMode() && (
                <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                  Demo mode · no real account required
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <FormField
                id="fullName"
                label="Full name"
                icon={<UserIcon size={16} />}
                type="text"
                autoComplete="name"
                placeholder="Yusuf Khalil"
                value={fullName}
                onChange={setFullName}
              />

              <FormField
                id="username"
                label="Username"
                icon={<UserIcon size={16} />}
                type="text"
                autoComplete="username"
                placeholder="choose_a_username"
                value={username}
                onChange={(v) => setUsername(v.toLowerCase())}
                maxLength={20}
                help={usernameHelp(usernameCheck)}
              />

              <FormField
                id="email"
                label="Email"
                icon={<MailIcon size={16} />}
                type="email"
                autoComplete="email"
                placeholder="name@gmail.com"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setDomainSuggestion(null);
                }}
                onBlur={() => setDomainSuggestion(suggestEmailDomain(email))}
              />
              {domainSuggestion && (
                <p
                  role="status"
                  aria-live="polite"
                  className="-mt-3 text-[11px] text-text-muted"
                >
                  Did you mean{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(applyDomainSuggestion(email, domainSuggestion));
                      setDomainSuggestion(null);
                    }}
                    className="font-medium text-accent underline underline-offset-2 transition hover:text-text-primary"
                  >
                    {domainSuggestion}
                  </button>
                  ? We need a working address to send your confirmation link.
                </p>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="academicYear"
                  className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted"
                >
                  Academic year
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                    <ListIcon size={16} />
                  </span>
                  <select
                    id="academicYear"
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="block h-11 w-full appearance-none rounded-lg border border-border bg-background pl-10 pr-10 text-sm text-text-primary transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 invalid:text-text-muted/60"
                  >
                    <option value="" disabled>
                      Select your year
                    </option>
                    {ACADEMIC_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {formatAcademicYear(y)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                    <ChevronDownIcon size={16} />
                  </span>
                </div>
                <p className="text-[11px] text-text-muted">
                  It moves up automatically every September.
                </p>
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
                  How did you hear about MediZee?{' '}
                  <span className="normal-case tracking-normal">(optional)</span>
                </legend>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SIGNUP_SOURCES.map((src) => {
                    const active = signupSource === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSignupSource(active ? null : src)}
                        className={`h-9 rounded-full border px-3.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          active
                            ? 'border-accent bg-accent/15 text-text-primary'
                            : 'border-border text-text-muted hover:border-accent/50 hover:text-text-primary'
                        }`}
                      >
                        {SIGNUP_SOURCE_LABELS[src]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <FormField
                id="password"
                label="Password"
                icon={<LockIcon size={16} />}
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
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <SpinnerIcon size={16} className="animate-spin" />
                ) : (
                  <>
                    Create account
                    <ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Below the form so the "how did you hear" answer above is
                already chosen when Google takes over. Year and username are
                collected after sign-in. */}
            <div className="mt-5 space-y-5">
              <OrDivider />
              <GoogleButton label="Sign up with Google" source={signupSource} />
            </div>

            <p className="mt-8 text-center text-sm text-text-muted">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-accent underline-offset-2 transition hover:text-text-primary hover:underline"
              >
                Log In
              </Link>
            </p>

            <p className="mt-4 text-center text-xs text-text-muted">
              <Link href="/terms" className="underline-offset-2 transition hover:text-text-primary hover:underline">
                Terms of Service
              </Link>
              {' · '}
              <Link href="/privacy" className="underline-offset-2 transition hover:text-text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

type FieldHelp = { tone: 'muted' | 'ok' | 'error'; text: string };

/** The line under the username field for the current availability state. */
function usernameHelp(check: UsernameCheck): FieldHelp {
  switch (check.status) {
    case 'invalid':
    case 'unavailable':
      return { tone: 'error', text: check.message };
    case 'checking':
      return { tone: 'muted', text: 'Checking…' };
    case 'available':
      return { tone: 'ok', text: 'Available' };
    default:
      return {
        tone: 'muted',
        text: 'Shown on the leaderboard instead of your name. 3–20 lowercase letters, numbers or underscores.',
      };
  }
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
  maxLength,
  help,
  onBlur,
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
  maxLength?: number;
  help?: FieldHelp;
  onBlur?: () => void;
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
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-describedby={help ? `${id}-help` : undefined}
          aria-invalid={help?.tone === 'error' ? true : undefined}
          className="block h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      {help && (
        <p
          id={`${id}-help`}
          aria-live="polite"
          className={
            help.tone === 'error'
              ? 'text-[11px] text-error'
              : help.tone === 'ok'
                ? 'text-[11px] text-success'
                : 'text-[11px] text-text-muted'
          }
        >
          {help.text}
        </p>
      )}
    </div>
  );
}

