/**
 * The pose table. All artwork is drawn on one shared 800x1100 canvas so every
 * layer lines up, which is what lets Bueno hop from his original pose into any
 * situation pose without the skull jumping around.
 */
export type PoseId =
  | 'rest'
  | 'flex'
  | 'thumbs'
  | 'flat'
  | 'angry'
  | 'cheer'
  | 'worried'
  | 'proud'
  | 'peace';

/** What the figure does once it has landed in its pose. */
export type IdleKind =
  | 'bob'
  | 'pump'
  | 'nod'
  | 'sway'
  | 'shake'
  | 'bounce'
  | 'tremble'
  | 'breathe';

export const CANVAS = { width: 800, height: 1100 } as const;

/** Skull anchor, measured from the final art, in canvas pixels. Accessories sit on it. */
export type SkullAnchor = { x: number; y: number; width: number; tilt: number };

export type PoseSpec = {
  id: PoseId;
  /** null for 'rest': it is built from the three original layers. */
  src: string | null;
  /** Hop height in % of the figure (negative = up, positive = a stomp down). */
  hop: number;
  /**
   * Scale when crouching before the move (a bit under 1), and at the top of the hop (a bit over 1).
   * ONE number each, applied to both axes: Bueno's width-to-height ratio never changes, not even
   * mid-animation. (Squashing him sideways reads as a distorted mascot, most of all on small screens.)
   */
  crouch: number;
  peak: number;
  /** Head tilt (degrees) on the way into the pose. */
  headTo: number;
  idle: IdleKind;
  skull: SkullAnchor;
};

/** The original pose: body (curled hands), waving arm (mirrored hand), head. */
export const REST_LAYERS = {
  body: '/mascot/bueno-body.webp',
  arm: '/mascot/bueno-arm-sym.webp',
  head: '/mascot/bueno-head.webp',
  /** Pivots in % of the canvas. */
  armPivot: { x: 70.4, y: 52.6 },
  headPivot: { x: 50.1, y: 48.2 },
} as const;

const s = (id: Exclude<PoseId, 'rest'>) => `/mascot/poses/${id}.webp`;

export const POSES: Record<PoseId, PoseSpec> = {
  rest: {
    id: 'rest', src: null, hop: 0, crouch: 1, peak: 1, headTo: 0, idle: 'bob',
    skull: { x: 401.5, y: 71, width: 510, tilt: 0 },
  },
  flex: {
    id: 'flex', src: s('flex'), hop: -9, crouch: 0.96, peak: 1.04, headTo: -6, idle: 'pump',
    skull: { x: 400.5, y: 71, width: 494, tilt: 0 },
  },
  thumbs: {
    id: 'thumbs', src: s('thumbs'), hop: -6, crouch: 0.97, peak: 1.03, headTo: 7, idle: 'nod',
    skull: { x: 389.5, y: 71, width: 491, tilt: 0 },
  },
  flat: {
    id: 'flat', src: s('flat'), hop: -1.5, crouch: 0.99, peak: 1.01, headTo: -4, idle: 'sway',
    skull: { x: 403, y: 71, width: 496, tilt: 0 },
  },
  angry: {
    id: 'angry', src: s('angry'), hop: 2.2, crouch: 0.96, peak: 1.0, headTo: 9, idle: 'shake',
    skull: { x: 399, y: 71, width: 495, tilt: 0 },
  },
  cheer: {
    id: 'cheer', src: s('cheer'), hop: -13, crouch: 0.95, peak: 1.05, headTo: -8, idle: 'bounce',
    skull: { x: 393.5, y: 71, width: 490, tilt: -4 },
  },
  worried: {
    id: 'worried', src: s('worried'), hop: 0.8, crouch: 0.98, peak: 1.0, headTo: 10, idle: 'tremble',
    skull: { x: 410.5, y: 71, width: 483, tilt: 6 },
  },
  proud: {
    id: 'proud', src: s('proud'), hop: -5, crouch: 0.97, peak: 1.03, headTo: -8, idle: 'breathe',
    skull: { x: 401.5, y: 71, width: 463, tilt: 0 },
  },
  peace: {
    id: 'peace', src: s('peace'), hop: -4, crouch: 0.98, peak: 1.02, headTo: 6, idle: 'sway',
    skull: { x: 364.5, y: 70, width: 483, tilt: 0 },
  },
};

/**
 * Choreography timeline in ms, identical for every pose: pop in standing in the
 * original pose, crouch, hop with a stretch, cross-fade into the pose at the top
 * of the hop, land with a squash, then idle. The arm never moves on the way into
 * a pose (a raised arm before the pose read as a bug); only the rest pose waves.
 */
export const TIMELINE = {
  enter: 420,
  crouchAt: 420,
  launchAt: 600,
  swapAt: 690,
  landAt: 830,
  idleAt: 1200,
  crossfade: 140,
} as const;

/** The wave Bueno does on his own (greeting), in ms. */
export const WAVE = { startAt: 420, duration: 1100, loopEvery: 6000 } as const;

export function poseSpec(id: PoseId): PoseSpec {
  return POSES[id];
}

/** Every image a pose needs, for preloading. */
export function poseImages(id: PoseId): string[] {
  const spec = POSES[id];
  return spec.src ? [spec.src] : [REST_LAYERS.body, REST_LAYERS.arm, REST_LAYERS.head];
}
