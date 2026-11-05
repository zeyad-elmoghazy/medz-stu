'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BuenoCard } from '@/components/mascot/BuenoCard';
import { pick, SAVED_EXIT_LINES } from '@/lib/mascot/copy';
import { consumeMascotEvent } from '@/lib/mascot/events';
import { decideGreeting, type Greeting } from '@/lib/mascot/greeting';
import { fetchMascotStatus, type MascotStatus } from '@/lib/mascot/mascot-api';
import { isQuietRoute } from '@/lib/mascot/routes';
import { markSeen, readSeen } from '@/lib/mascot/seen';
import { isDemoMode } from '@/lib/demo-profile';


type Shown =
  | { type: 'greeting'; greeting: Greeting }
  | { type: 'peace'; line: string };

/** How long each kind of card stays before it leaves on its own (ms). */
const AUTO_DISMISS = { peace: 5200, quiet: 6500, nudge: 16000 } as const;

/**
 * Lives in the student layout. It shows, at most one at a time:
 *  - the peace-sign "progress saved" card right after Save & Exit;
 *  - the daily greeting (once per day, once more in the evening if the streak is
 *    still at risk), which also covers the 100-question streak rescue.
 * It never covers a blocking prompt, a quiz in progress, or a results screen.
 */
export function MascotHost() {
  const pathname = usePathname();
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  // One shared in-flight request: if the effect re-runs while it is pending (React StrictMode in
  // dev, or the student navigating), the live run awaits the same promise instead of giving up.
  const statusPromise = useRef<Promise<MascotStatus | null> | null>(null);
  const decided = useRef(false);
  const shownRef = useRef<Shown | null>(null);
  // True while any dialog is open anywhere on the page (the username / academic-year prompts, an
  // exit confirmation...). Bueno steps aside while it is, and returns when it closes. Watching the
  // DOM continuously matters: the prompts mount only after their own profile fetch resolves, which
  // can be after the greeting has already been decided.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const check = () => setBlocked(!!document.querySelector('[role="dialog"]'));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(check);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 260);
  }, []);

  // A pending goodbye from Save & Exit is shown on whatever page we land on.
  useEffect(() => {
    if (isDemoMode() || isQuietRoute(pathname) || shownRef.current) return;
    // sessionStorage only exists on the client, so this note can only be read in an effect.
    const ev = consumeMascotEvent();
    if (ev?.type === 'saved-exit') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown({ type: 'peace', line: pick(SAVED_EXIT_LINES, Date.now()) });
    }
  }, [pathname]);

  // The daily greeting.
  useEffect(() => {
    if (isDemoMode() || decided.current || isQuietRoute(pathname) || blocked) return;
    let cancelled = false;

    async function run() {
      statusPromise.current ??= fetchMascotStatus();
      const status = await statusPromise.current;
      if (!status) {
        statusPromise.current = null; // failed: the next navigation may try again
        return;
      }
      if (cancelled) return;
      // A prompt may have opened while the request was in flight: wait (this effect re-runs when it closes).
      if (document.querySelector('[role="dialog"]')) return;
      if (shownRef.current) return;

      const greeting = decideGreeting({
        state: status.state,
        rescue: status.rescue,
        localHour: new Date().getHours(),
        seen: readSeen(status.userId),
      });
      decided.current = true;
      if (!greeting) return;
      markSeen(status.userId, greeting.marks, status.state.today);
      setShown({ type: 'greeting', greeting });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [pathname, blocked]);

  // Leave on their own (the clock only runs while nothing is covering him).
  useEffect(() => {
    if (!shown || blocked) return;
    const ms =
      shown.type === 'peace'
        ? AUTO_DISMISS.peace
        : shown.greeting.kind === 'done-quiet'
          ? AUTO_DISMISS.quiet
          : AUTO_DISMISS.nudge;
    const t = setTimeout(dismiss, ms);
    return () => clearTimeout(t);
  }, [shown, blocked, dismiss]);

  if (!shown || blocked) return null;

  return (
    <MascotToast leaving={leaving} onClose={dismiss} testId={shown.type === 'peace' ? 'bueno-peace' : `bueno-greeting-${shown.greeting.kind}`}>
      {shown.type === 'peace' ? (
        <BuenoCard pose="peace" size="clamp(84px, 22vw, 118px)" headline={shown.line} />
      ) : (
        <BuenoCard
          pose={shown.greeting.pose}
          size="clamp(84px, 22vw, 118px)"
          headline={shown.greeting.headline}
          body={shown.greeting.body}
        >
          {shown.greeting.progress && <RescueMeter done={shown.greeting.progress.done} total={shown.greeting.progress.total} />}
          {shown.greeting.cta && (
            <Link
              href={shown.greeting.cta.href}
              onClick={dismiss}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 40,
                marginTop: shown.greeting.progress ? 10 : 0,
                padding: '0 16px',
                borderRadius: 10,
                background: 'var(--accent-text)',
                color: '#fff',
                fontSize: 13.5,
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              {shown.greeting.cta.label}
            </Link>
          )}
        </BuenoCard>
      )}
    </MascotToast>
  );
}

function RescueMeter({ done, total }: { done: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (done / total) * 100));
  // Grow the fill with a transform (not its width) once mounted, so the bar animates without forcing layout.
  const [grown, setGrown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(pct / 100));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div data-testid="rescue-meter">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
        <span>Questions today</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {done} / {total}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'var(--fill)', border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div
          data-testid="rescue-meter-fill"
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg,#FF8A1F,#FFC83D)',
            transform: `scaleX(${grown})`,
            transformOrigin: 'left',
            transition: 'transform 600ms cubic-bezier(.2,.8,.2,1)',
          }}
        />
      </div>
    </div>
  );
}

/** The floating card: bottom-right on desktop, full width at the bottom on phones. */
export function MascotToast({
  children,
  onClose,
  leaving,
  testId,
}: {
  children: React.ReactNode;
  onClose: () => void;
  leaving: boolean;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        position: 'fixed',
        zIndex: 80,
        right: 'max(12px, env(safe-area-inset-right))',
        left: 'max(12px, env(safe-area-inset-left))',
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        marginLeft: 'auto',
        maxWidth: 420,
        padding: '6px 10px 6px 6px',
        background: 'var(--bg)',
        border: '1px solid var(--line2)',
        borderRadius: 22,
        boxShadow: '0 18px 50px rgba(0,0,0,.28)',
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'translateY(12px)' : 'none',
        transition: 'opacity 240ms ease, transform 240ms ease',
        animation: 'bueno-toast-in 320ms cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      <style>{`
        @keyframes bueno-toast-in { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [data-testid^="bueno-"] { animation: none !important; transition: none !important; } }
      `}</style>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        data-testid="bueno-dismiss"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 2,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid var(--line2)',
          background: 'var(--surface)',
          color: 'var(--text3)',
          fontSize: 15,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      {children}
    </div>
  );
}
