'use client';

import { useCallback, useEffect, useState } from 'react';
import { BuenoCard } from '@/components/mascot/BuenoCard';
import { MascotToast } from '@/components/mascot/MascotHost';
import { pick, SIGNED_OUT_LINES } from '@/lib/mascot/copy';
import { consumeMascotEvent } from '@/lib/mascot/events';

/**
 * Bueno's goodbye on the login page, right after a student signs out. The
 * sign-out button leaves a note in sessionStorage and this picks it up, so the
 * peace sign appears exactly once and never on a normal visit to /login.
 */
export function AuthGoodbye() {
  const [line, setLine] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const ev = consumeMascotEvent();
    // The effect-driven state change is the point here: sessionStorage only exists on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ev?.type === 'signed-out') setLine(pick(SIGNED_OUT_LINES, Date.now()));
  }, []);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => setLine(null), 260);
  }, []);

  useEffect(() => {
    if (!line) return;
    const t = setTimeout(dismiss, 5200);
    return () => clearTimeout(t);
  }, [line, dismiss]);

  if (!line) return null;

  return (
    <MascotToast leaving={leaving} onClose={dismiss} testId="bueno-goodbye">
      <BuenoCard pose="peace" size="clamp(84px, 22vw, 118px)" headline={line} />
    </MascotToast>
  );
}
