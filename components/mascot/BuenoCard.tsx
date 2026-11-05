'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bueno } from '@/components/mascot/Bueno';
import { pick, POKE_LINES } from '@/lib/mascot/copy';
import type { Accessory } from '@/lib/mascot/milestones';
import type { PoseId } from '@/lib/mascot/poses';

/**
 * Bueno on the left, a speech bubble on the right (also on phones: he stays left
 * of the text). Poking him swaps the bubble's text for a bone pun for a moment.
 */
export function BuenoCard({
  pose,
  accessory = null,
  size = 'clamp(96px, 26vw, 150px)',
  headline,
  body,
  extra,
  children,
  interactive = true,
  className,
}: {
  pose: PoseId;
  accessory?: Accessory | null;
  size?: number | string;
  headline: string;
  body?: string;
  /** A second, smaller line under the body (e.g. "Up 12% from your last attempt"). */
  extra?: string | null;
  /** Buttons / meters under the text. */
  children?: ReactNode;
  interactive?: boolean;
  className?: string;
}) {
  const [poke, setPoke] = useState<string | null>(null);
  const pokes = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function onPoke() {
    pokes.current += 1;
    setPoke(pick(POKE_LINES, pokes.current + 2));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPoke(null), 3200);
  }

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 1.5vw, 14px)', minWidth: 0 }}
    >
      <Bueno pose={pose} accessory={accessory} size={size} interactive={interactive} onPoke={onPoke} style={{ flex: '0 0 auto' }} />
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'relative',
          minWidth: 0,
          flex: '1 1 auto',
          background: 'var(--surface)',
          border: '1px solid var(--line2)',
          borderRadius: 16,
          padding: '12px 16px',
          animation: 'bueno-bubble-in 380ms 700ms cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        <style>{`
          @keyframes bueno-bubble-in { 0% { opacity: 0; transform: translateX(-8px) scale(.96); } 100% { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) { [role="status"] { animation: none !important; } }
        `}</style>
        {/* the bubble's tail, pointing at Bueno */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -7,
            top: '50%',
            width: 12,
            height: 12,
            marginTop: -6,
            background: 'var(--surface)',
            borderLeft: '1px solid var(--line2)',
            borderBottom: '1px solid var(--line2)',
            transform: 'rotate(45deg)',
          }}
        />
        <div style={{ fontSize: 'clamp(15px, 4vw, 19px)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.25 }}>
          {headline}
        </div>
        {(poke ?? body) && (
          <div style={{ marginTop: 4, fontSize: 'clamp(12.5px, 3.3vw, 14px)', color: poke ? 'var(--accent-text)' : 'var(--text3)', lineHeight: 1.45, fontStyle: poke ? 'italic' : undefined }}>
            {poke ?? body}
          </div>
        )}
        {extra && !poke && (
          <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-text)' }}>{extra}</div>
        )}
        {children && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
    </div>
  );
}
