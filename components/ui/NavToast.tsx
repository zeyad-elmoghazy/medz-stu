'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
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

export function NavToast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        // Full-width flex row so the pill centers regardless of
        // viewport. Wrapping in a positioning parent avoids the
        // classic `translateX(-50%)` vs motion-transform collision.
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            style={{
              pointerEvents: 'auto',
              padding: '11px 20px',
              borderRadius: 12,
              background: 'rgba(13,11,26,0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(139,92,246,0.4)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 22px rgba(124,58,237,0.28)',
              color: '#F8FAFC',
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '-0.005em',
            }}
          >
            {message}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
