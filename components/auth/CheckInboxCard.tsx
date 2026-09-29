import Link from 'next/link';
import { MailCheckIcon } from '@/components/icons';

export function CheckInboxCard({
  email,
  heading,
  body,
  backHref,
  backLabel,
}: {
  email: string;
  heading: string;
  body: string;
  backHref: string;
  backLabel: string;
}) {
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
        <span className="font-medium text-text-primary">{email}</span>.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        No email yet? Check your spam folder, or try again in a minute.
      </p>

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
