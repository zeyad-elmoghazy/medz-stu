'use client';

import { useEffect, useState } from 'react';

/**
 * State for NavToast. Lives apart from the component so importing the hook
 * doesn't drag framer-motion into the importer's chunk.
 *
 * Tiny nav-only toast. Used for "not built yet" affordances on
 * links like `Pricing` and `AI Tutor` — showing a floating chip
 * beats a modal or a route change to a stub page.
 *
 * The hook holds a single message string + auto-clears it after
 * `duration` ms. Two independent nav items firing in quick
 * succession just replace the message; the timer resets because
 * the effect depends on `message`.
 */
export function useNavToast(duration = 2500) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), duration);
    return () => clearTimeout(t);
  }, [message, duration]);

  return { message, showToast: setMessage };
}
