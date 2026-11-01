import Link from 'next/link';

/**
 * Server-rendered stand-in for the auth cards that sit behind
 * `<Suspense>` (login, reset-password need useSearchParams, which
 * forces a client-only boundary). With `fallback={null}` the
 * prerendered HTML was an empty body — no <main>, no <h1> — so
 * crawlers and no-JS clients saw nothing. This renders the same shell
 * and heading the real card opens with; once the client component
 * mounts it replaces this entirely, so there is never a second <h1>.
 *
 * The card is `opacity: 0` on purpose. The real card mounts with
 * `animate-fade-in-up` (starts at opacity 0), so a visible fallback
 * would flash on screen, vanish, then fade back in. Hidden, the page
 * looks exactly as it did before — blank, then the card fades in —
 * while the heading is still in the HTML. The text is identical to what
 * the real card renders, so nothing is hidden from users that crawlers
 * see differently.
 */
export function AuthCardFallback({ heading, subheading }: { heading: string; subheading: string }) {
  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-10" style={{ opacity: 0 }}>
        <Link href="/" className="mx-auto flex w-fit flex-col items-center gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-text-primary">MediZee</span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-text-muted">Exam prep, structured.</span>
        </Link>

        <div className="mt-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{heading}</h1>
          <p className="mt-1.5 text-sm text-text-muted">{subheading}</p>
        </div>
      </div>
    </main>
  );
}
