'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Quiz-header XP chip: the XP earned in this quiz so far, plus a "+10 XP"
 * that floats up from it each time the server credits an answer
 * (migration 048 — only the first correct answer to a question pays out,
 * so repeats show nothing). Hidden until the first XP of the session.
 */
export function XpCounter({
  total,
  gain,
}: {
  total: number;
  /** The latest credit; a new `key` replays the float-up. */
  gain: { key: number; amount: number } | null;
}) {
  const reduceMotion = useReducedMotion();
  if (total <= 0) return null;

  return (
    <span className="relative inline-flex" aria-live="polite">
      <span
        className="rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
        style={{ backgroundColor: 'rgb(var(--accent-text-rgb) / 0.12)', color: 'var(--accent-text)' }}
        title="XP earned in this quiz"
      >
        {total} XP
      </span>
      <AnimatePresence>
        {gain && (
          <motion.span
            key={gain.key}
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-xs font-bold"
            style={{ color: 'var(--accent-text)' }}
            initial={{ opacity: 0, y: 0 }}
            animate={
              reduceMotion
                ? { opacity: [0, 1, 0] }
                : { opacity: [0, 1, 1, 0], y: [4, -18, -26, -34] }
            }
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            +{gain.amount} XP
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
