'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const COLORS = ['#14A3A3', '#F5B73B', '#E5484D', '#45CBBB', '#F2F0EA', '#7C5CFF'];

/** A small deterministic PRNG so the pieces are the same on server and client. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One burst of confetti over its (positioned) parent. Pure CSS pieces driven by
 * the Web Animations API; renders nothing for people who asked for reduced motion.
 */
export function Confetti({ count = 44, seed = 7, delayMs = 0 }: { count?: number; seed?: number; delayMs?: number }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);

  const pieces = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      left: r() * 100,
      size: 6 + r() * 7,
      color: COLORS[Math.floor(r() * COLORS.length)],
      round: r() > 0.6,
      drift: (r() - 0.5) * 160,
      spin: (r() - 0.5) * 900,
      delay: r() * 500,
      duration: 1900 + r() * 1500,
    }));
  }, [count, seed]);

  useEffect(() => {
    const el = box.current;
    if (!el || reduce) return;
    const anims = Array.from(el.children).map((child, i) => {
      const p = pieces[i];
      return (child as HTMLElement).animate(
        [
          { transform: 'translate(0, -8vh) rotate(0deg)', opacity: 1 },
          { transform: `translate(${p.drift}px, 105vh) rotate(${p.spin}deg)`, opacity: 1, offset: 0.85 },
          { transform: `translate(${p.drift * 1.1}px, 112vh) rotate(${p.spin * 1.1}deg)`, opacity: 0 },
        ],
        { delay: delayMs + p.delay, duration: p.duration, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'both' }
      );
    });
    return () => anims.forEach((a) => a.cancel());
  }, [pieces, reduce, delayMs]);

  if (reduce) return null;

  return (
    <div
      ref={box}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.55,
            borderRadius: p.round ? '50%' : 2,
            backgroundColor: p.color,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
