'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MailCheckIcon } from '@/components/icons';

/** Matches Supabase's per-address limit on confirmation emails. */
const RESEND_COOLDOWN_SECONDS = 60;

export type ResendResult = { error?: string | null };

export function CheckInboxCard({
  email,
  heading,
  body,
  backHref,
  backLabel,
  onResend,
}: {
  email: string;
  heading: string;
  body: string;
  backHref: string;
  backLabel: string;
  /** When given, shows "Resend confirmation email" (signup only). */
  onResend?: () => Promise<ResendResult>;
}) {
  // The email was just sent, so the first resend has to wait too.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!onResend || sending || cooldown > 0) return;
    setSending(true);
    setNotice(null);
    try {
      const { error } = await onResend();
      if (error) {
        setNotice({ tone: 'error', text: error });
      } else {
        setNotice({ tone: 'ok', text: 'Sent again. Check your inbox and spam folder.' });
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      setNotice({ tone: 'error', text: "Couldn't send the email. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="animate-fade-in-down text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/35 bg-accent/10">
        <MailCheckIcon size={24} className="text-accent" />
      </span>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-text-primary">
        {heading}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        {body} We sent a link to{' '}
        <span className="break-words font-medium text-text-primary">{email}</span>.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        No email yet? Check your spam folder, or try again in a minute.
      </p>

      {onResend && (
        <div className="mt-5">
          <button
            type="button"
            onClick={resend}
            disabled={sending || cooldown > 0}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-text-primary transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend confirmation email (${cooldown}s)`
                : 'Resend confirmation email'}
          </button>
          {notice && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-2 text-xs ${notice.tone === 'ok' ? 'text-success' : 'text-error'}`}
            >
              {notice.text}
            </p>
          )}
        </div>
      )}

      <Link
        href={backHref}
        className="mt-8 inline-flex text-sm font-medium text-accent underline-offset-2 transition hover:text-text-primary hover:underline"
      >
        {backLabel}
      </Link>
    </div>
  );
}

export default CheckInboxCard;
