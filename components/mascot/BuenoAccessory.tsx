'use client';

import { useEffect, useId, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Accessory } from '@/lib/mascot/milestones';
import { CANVAS, type SkullAnchor } from '@/lib/mascot/poses';

/**
 * Party hat, graduation cap or crown, drawn in the same 800x1100 canvas as the
 * artwork and anchored to the measured top of the skull, so it sits on Bueno's
 * head in whatever pose he is in. It pops on after he has landed.
 */
export function BuenoAccessory({
  kind,
  skull,
  appearAtMs,
}: {
  kind: Accessory;
  skull: SkullAnchor;
  /** When (ms after mount) to pop on. */
  appearAtMs: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.style.opacity = '1';
      return;
    }
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(0.2) rotate(-14deg)' },
        { opacity: 1, transform: 'scale(1.12) rotate(3deg)', offset: 0.65 },
        { opacity: 1, transform: 'scale(1) rotate(0deg)' },
      ],
      { delay: appearAtMs, duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    );
    anim.persist?.();
    return () => anim.cancel();
  }, [appearAtMs, reduce]);

  const w = skull.width;
  const u = (k: number) => k * w;

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        opacity: 0,
        transformOrigin: `${(skull.x / CANVAS.width) * 100}% ${(skull.y / CANVAS.height) * 100}%`,
      }}
    >
      {/* (0,0) is the top of the skull; shapes grow upward (negative y). */}
      <g transform={`translate(${skull.x} ${skull.y}) rotate(${skull.tilt})`}>
        {kind === 'partyHat' && <PartyHat u={u} id={uid} />}
        {kind === 'gradCap' && <GradCap u={u} />}
        {kind === 'crown' && <Crown u={u} id={uid} />}
      </g>
    </svg>
  );
}

type U = (k: number) => number;

function PartyHat({ u, id }: { u: U; id: string }) {
  const apexX = u(0.05);
  const apexY = -u(0.5);
  const base = 22;
  return (
    <g>
      <defs>
        <clipPath id={`${id}-cone`}>
          <polygon points={`${-u(0.2)},${base} ${u(0.2)},${base} ${apexX},${apexY}`} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#45CBBB" />
          <stop offset="1" stopColor="#0E8F8F" />
        </linearGradient>
      </defs>
      <polygon
        points={`${-u(0.2)},${base} ${u(0.2)},${base} ${apexX},${apexY}`}
        fill={`url(#${id}-fill)`}
      />
      <g clipPath={`url(#${id}-cone)`}>
        {[0.12, 0.27, 0.42].map((t, i) => (
          <polygon
            key={i}
            points={`${-u(0.3)},${-u(t) + 18} ${u(0.3)},${-u(t) - 10} ${u(0.3)},${-u(t) + 2} ${-u(0.3)},${-u(t) + 30}`}
            fill="#F5B73B"
            opacity="0.95"
          />
        ))}
        {[-0.08, 0.06, 0.0, 0.1].map((x, i) => (
          <circle key={i} cx={u(x)} cy={-u(0.06 + i * 0.1)} r={u(0.012)} fill="#FFFFFF" opacity="0.9" />
        ))}
      </g>
      <ellipse cx="0" cy={base} rx={u(0.225)} ry={u(0.034)} fill="#0A6F6F" />
      <circle cx={apexX} cy={apexY} r={u(0.05)} fill="#F5B73B" />
      <circle cx={apexX - u(0.014)} cy={apexY - u(0.014)} r={u(0.014)} fill="#FFE9A6" />
    </g>
  );
}

function GradCap({ u }: { u: U }) {
  const base = 24;
  return (
    <g>
      {/* skull cap */}
      <path
        d={`M ${-u(0.215)} ${base} L ${-u(0.2)} ${-u(0.06)} Q 0 ${-u(0.12)} ${u(0.2)} ${-u(0.06)} L ${u(0.215)} ${base} Z`}
        fill="#1F2D3A"
      />
      {/* board */}
      <polygon
        points={`${-u(0.38)},${-u(0.07)} 0,${-u(0.185)} ${u(0.38)},${-u(0.07)} 0,${u(0.045)}`}
        fill="#2B3F52"
        stroke="#4F6B82"
        strokeWidth={u(0.006)}
        strokeLinejoin="round"
      />
      <circle cx="0" cy={-u(0.07)} r={u(0.022)} fill="#F5B73B" />
      {/* tassel */}
      <path
        d={`M 0 ${-u(0.07)} L ${u(0.36)} ${-u(0.075)} L ${u(0.36)} ${u(0.12)}`}
        fill="none"
        stroke="#F5B73B"
        strokeWidth={u(0.01)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x={u(0.335)} y={u(0.105)} width={u(0.05)} height={u(0.075)} rx={u(0.012)} fill="#F5B73B" />
    </g>
  );
}

function Crown({ u, id }: { u: U; id: string }) {
  const base = 20;
  const path =
    `M ${-u(0.21)} ${base} L ${-u(0.235)} ${-u(0.15)} L ${-u(0.115)} ${-u(0.07)} ` +
    `L 0 ${-u(0.23)} L ${u(0.115)} ${-u(0.07)} L ${u(0.235)} ${-u(0.15)} L ${u(0.21)} ${base} Z`;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFD965" />
          <stop offset="1" stopColor="#E09B1A" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${id}-gold)`} stroke="#B97A0E" strokeWidth={u(0.007)} strokeLinejoin="round" />
      <rect x={-u(0.21)} y={base - u(0.07)} width={u(0.42)} height={u(0.07)} rx={u(0.012)} fill="#E8A81C" />
      {[
        [-0.235, -0.15],
        [0, -0.23],
        [0.235, -0.15],
      ].map(([x, y], i) => (
        <circle key={i} cx={u(x)} cy={u(y)} r={u(0.024)} fill="#FFF3C4" stroke="#B97A0E" strokeWidth={u(0.005)} />
      ))}
      <circle cx="0" cy={base - u(0.035)} r={u(0.022)} fill="#E5484D" />
      <circle cx={-u(0.1)} cy={base - u(0.035)} r={u(0.016)} fill="#2FB8A8" />
      <circle cx={u(0.1)} cy={base - u(0.035)} r={u(0.016)} fill="#2FB8A8" />
    </g>
  );
}
