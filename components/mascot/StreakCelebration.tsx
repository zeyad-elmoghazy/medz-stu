'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { Bueno } from '@/components/mascot/Bueno';
import { Confetti } from '@/components/mascot/Confetti';
import { streakCelebrationCopy } from '@/lib/mascot/copy';
import { milestoneFor } from '@/lib/mascot/milestones';
import type { StreakOutcome } from '@/lib/mascot/streak-outcome';
import { addDays, weekdayOf } from '@/lib/streak-date';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The full-screen "your streak just grew" moment, in the spirit of Duolingo's:
 * Bueno jumps for joy, the flame's number counts up, and the week row ticks
 * today. A milestone adds a party hat (a graduation cap at 100 days); saving a
 * streak with the 100-question rescue says "Streak saved!".
 */
export function StreakCelebration({ outcome, onDone }: { outcome: StreakOutcome; onDone: () => void }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const button = useRef<HTMLButtonElement>(null);
  const todayDot = useRef<HTMLDivElement>(null);
  const [counted, setCounted] = useState(outcome.before);

  const milestone = outcome.milestoneDays !== null ? milestoneFor(outcome.after) : null;
  const copy = streakCelebrationCopy({
    streak: outcome.after,
    rescued: outcome.rescued,
    milestoneDays: outcome.milestoneDays,
  });
  const partying = outcome.rescued || outcome.milestoneDays !== null;
  // With reduced motion there is no count-up: show the final number straight away.
  const shown = reduce ? outcome.after : counted;

  useEffect(() => {
    button.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  useEffect(() => {
    if (reduce) return;
    const count = animate(outcome.before, outcome.after, {
      duration: 0.9,
      delay: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => setCounted(Math.round(v)),
    });
    const dot = todayDot.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.35)', offset: 0.5 },
        { transform: 'scale(1)' },
      ],
      { delay: 1700, duration: 520, easing: 'ease-out' }
    );
    return () => {
      count.stop();
      dot?.cancel();
    };
  }, [outcome.before, outcome.after, reduce]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(outcome.today, i - 6);
    return { date, letter: DAY_LETTERS[weekdayOf(date)], active: outcome.last7[i] === true, isToday: i === 6 };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      data-testid="streak-celebration"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '24px 20px',
        overflowY: 'auto',
        background: 'color-mix(in srgb, var(--bg) 94%, transparent)',
        backdropFilter: 'blur(10px)',
        animation: reduce ? undefined : 'bueno-fade-in 220ms ease-out both',
      }}
    >
      <style>{`@keyframes bueno-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {partying && <Confetti seed={outcome.after} delayMs={700} />}

      <Bueno
        key="cheer"
        pose="cheer"
        accessory={milestone?.accessory ?? null}
        size="min(52vw, 230px)"
        label="Bueno jumping for joy"
      />

      {/* the flame, with the streak counting up inside it */}
      <div style={{ position: 'relative', width: 132, height: 156, marginTop: -4 }} aria-hidden="true">
        <svg viewBox="0 0 64 80" width="132" height="156" style={{ display: 'block', filter: 'drop-shadow(0 6px 14px rgba(249,115,22,.35))' }}>
          <defs>
            <linearGradient id={`${uid}-flame`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#FFC83D" />
              <stop offset="0.55" stopColor="#FF8A1F" />
              <stop offset="1" stopColor="#F2541B" />
            </linearGradient>
          </defs>
          <path
            d="M32 2C34 17 53 27 53 49c0 16-9 29-21 29S11 65 11 49c0-9 4-15 9-20 1 7 4 11 8 12-2-15 0-29 4-39z"
            fill={`url(#${uid}-flame)`}
          />
          <path
            d="M32 40c1 7 10 11 10 21 0 7-4 12-10 12s-10-5-10-12c0-5 3-8 6-11 1 3 2 4 4 5-1-6-1-11 0-15z"
            fill="#FFE08A"
            opacity="0.9"
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '46%',
            textAlign: 'center',
            fontSize: 54,
            lineHeight: 1,
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 2px 10px rgba(150,50,0,.45)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {shown}
        </div>
      </div>

      <h2
        id={`${uid}-title`}
        style={{ margin: 0, fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', textAlign: 'center' }}
      >
        {copy.headline}
      </h2>
      <p style={{ margin: 0, maxWidth: 420, textAlign: 'center', fontSize: 15, color: 'var(--text3)', lineHeight: 1.45 }}>
        {copy.sub}
      </p>

      {/* this week */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 8,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 16,
        }}
      >
        {days.map((d) => (
          <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: d.isToday ? 'var(--accent-text)' : 'var(--text3)' }}>{d.letter}</span>
            <div
              ref={d.isToday ? todayDot : undefined}
              data-active={d.active ? 'true' : 'false'}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: d.active ? '#FF8A1F' : 'var(--fill)',
                border: d.isToday ? '2px solid var(--accent-text)' : '1px solid var(--line2)',
                color: '#fff',
              }}
            >
              {d.active && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        ref={button}
        type="button"
        onClick={onDone}
        data-testid="streak-continue"
        style={{
          marginTop: 14,
          minHeight: 48,
          minWidth: 200,
          padding: '0 28px',
          borderRadius: 14,
          border: 'none',
          background: 'var(--accent-text)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '0.02em',
          cursor: 'pointer',
        }}
      >
        Continue
      </button>
    </div>
  );
}
