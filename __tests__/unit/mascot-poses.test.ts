import * as fs from 'fs';
import * as path from 'path';
import { CANVAS, POSES, REST_LAYERS, TIMELINE, WAVE, poseImages, poseSpec, type PoseId } from '@/lib/mascot/poses';

const PUBLIC = path.join(process.cwd(), 'public');
const ALL = Object.keys(POSES) as PoseId[];
const IDLES = ['bob', 'pump', 'nod', 'sway', 'shake', 'bounce', 'tremble', 'breathe'];

describe('pose table', () => {
  it('has all nine poses, each keyed by its own id', () => {
    expect(ALL.sort()).toEqual(['angry', 'cheer', 'flat', 'flex', 'peace', 'proud', 'rest', 'thumbs', 'worried']);
    for (const id of ALL) expect(POSES[id].id).toBe(id);
  });

  it('every image a pose needs exists in /public and is a real file', () => {
    for (const id of ALL) {
      for (const url of poseImages(id)) {
        const file = path.join(PUBLIC, url);
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.statSync(file).size).toBeGreaterThan(5_000);
      }
    }
  });

  it('only rest is built from layers; every other pose is a single image', () => {
    expect(poseSpec('rest').src).toBeNull();
    expect(poseImages('rest')).toEqual([REST_LAYERS.body, REST_LAYERS.arm, REST_LAYERS.head]);
    for (const id of ALL.filter((p) => p !== 'rest')) {
      expect(poseSpec(id).src).toBe(`/mascot/poses/${id}.webp`);
      expect(poseImages(id)).toHaveLength(1);
    }
  });

  it('uses the matching-hands arm and never overwrites the landing page art', () => {
    expect(REST_LAYERS.arm).toBe('/mascot/bueno-arm-sym.webp');
    expect(REST_LAYERS.body).toBe('/mascot/bueno-body.webp');
  });

  it('motion parameters are finite and sane', () => {
    for (const id of ALL) {
      const p = POSES[id];
      expect(IDLES).toContain(p.idle);
      for (const n of [p.hop, p.headTo, ...p.squash, ...p.stretch]) expect(Number.isFinite(n)).toBe(true);
      expect(p.squash[0]).toBeGreaterThanOrEqual(1); // crouch: wider...
      expect(p.squash[1]).toBeLessThanOrEqual(1); // ...and shorter
      expect(Math.abs(p.hop)).toBeLessThanOrEqual(20);
    }
  });

  it('skull anchors sit inside the canvas, near the shared skull line', () => {
    for (const id of ALL) {
      const { x, y, width } = POSES[id].skull;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(CANVAS.width);
      expect(y).toBeGreaterThanOrEqual(60);
      expect(y).toBeLessThanOrEqual(80);
      expect(width).toBeGreaterThan(400);
      expect(width).toBeLessThan(560);
    }
  });
});

describe('choreography timeline', () => {
  it('runs strictly in order: crouch, launch, swap, land, idle', () => {
    const t = TIMELINE;
    expect(t.enter).toBeLessThanOrEqual(t.crouchAt);
    expect(t.crouchAt).toBeLessThan(t.launchAt);
    expect(t.launchAt).toBeLessThan(t.swapAt);
    expect(t.swapAt).toBeLessThan(t.landAt);
    expect(t.landAt).toBeLessThan(t.idleAt);
  });

  it('cross-fades while airborne and finishes before landing', () => {
    expect(TIMELINE.swapAt).toBeGreaterThan(TIMELINE.launchAt);
    expect(TIMELINE.swapAt + TIMELINE.crossfade).toBeLessThanOrEqual(TIMELINE.landAt + 100);
  });

  it('a reaction is fully in place in about a second (no long wait before feedback)', () => {
    expect(TIMELINE.landAt).toBeLessThanOrEqual(1000);
    expect(TIMELINE.idleAt).toBeLessThanOrEqual(1500);
  });

  it('the wave is a separate, optional behaviour of the rest pose', () => {
    expect(WAVE.duration).toBeGreaterThan(0);
    expect(WAVE.loopEvery).toBeGreaterThan(WAVE.duration);
  });
});
