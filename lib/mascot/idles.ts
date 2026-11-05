import type { IdleKind } from '@/lib/mascot/poses';

/**
 * Idle loops: what Bueno does once he has landed in a pose. Each entry is a set
 * of keyframes sharing one `times` array (0..1). Values are CSS-ready: x / y are
 * percentages of the figure, rotate is degrees, scale is a plain number.
 *
 * `scale` is deliberately ONE number per keyframe, applied to both axes: Bueno's
 * width-to-height ratio must never change, not even for a moment (squashing him
 * sideways reads as a distorted mascot, most of all on small screens).
 */
export type IdleSpec = {
  /** Length of one loop, in ms. */
  duration: number;
  times: number[];
  x?: string[];
  y?: string[];
  rotate?: number[];
  /** Uniform scale (same on both axes). */
  scale?: number[];
  easing: string;
};

export const IDLES: Record<IdleKind, IdleSpec> = {
  bob: {
    duration: 3200, easing: 'ease-in-out',
    times: [0, 0.5, 1],
    y: ['0%', '-1.6%', '0%'],
  },
  // flexing: two pumps, then a breath
  pump: {
    duration: 3200, easing: 'ease-in-out',
    times: [0, 0.12, 0.24, 0.36, 0.48, 0.74, 1],
    scale: [1, 1.045, 1, 1.045, 1, 1, 1],
    y: ['0%', '-0.8%', '0%', '-0.8%', '0%', '-1.2%', '0%'],
  },
  // thumbs up: two approving nods
  nod: {
    duration: 3000, easing: 'ease-in-out',
    times: [0, 0.1, 0.2, 0.3, 0.4, 0.7, 1],
    y: ['0%', '-2.4%', '0%', '-2.4%', '0%', '-1%', '0%'],
    rotate: [0, -2, 0, -2, 0, 0, 0],
  },
  // deadpan / relaxed: a slow lean
  sway: {
    duration: 4200, easing: 'ease-in-out',
    times: [0, 0.25, 0.75, 1],
    rotate: [0, 1.4, -1.4, 0],
  },
  // angry: a quick shudder, then still
  shake: {
    duration: 2600, easing: 'linear',
    times: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 1],
    x: ['0%', '-1.2%', '1.2%', '-1%', '1%', '0%', '0%'],
    rotate: [0, -0.8, 0.8, -0.6, 0.6, 0, 0],
  },
  // celebrating: keeps jumping
  bounce: {
    duration: 1500, easing: 'ease-in-out',
    times: [0, 0.28, 0.5, 0.62, 1],
    y: ['0%', '-9%', '1.5%', '0%', '0%'],
    scale: [1, 1.03, 0.97, 1, 1],
  },
  // worried: a nervous tremble
  tremble: {
    duration: 130, easing: 'linear',
    times: [0, 0.5, 1],
    x: ['0%', '0.5%', '0%'],
    rotate: [0, 0.6, 0],
  },
  // proud: slow chest-out breathing
  breathe: {
    duration: 3400, easing: 'ease-in-out',
    times: [0, 0.5, 1],
    scale: [1, 1.03, 1],
    y: ['0%', '-0.8%', '0%'],
  },
};

/** Web Animations keyframes for an idle loop. */
export function idleKeyframes(spec: IdleSpec): Keyframe[] {
  return spec.times.map((offset, i) => ({
    offset,
    transform:
      `translate(${spec.x?.[i] ?? '0%'}, ${spec.y?.[i] ?? '0%'}) ` +
      `rotate(${spec.rotate?.[i] ?? 0}deg) ` +
      `scale(${spec.scale?.[i] ?? 1})`,
  }));
}
