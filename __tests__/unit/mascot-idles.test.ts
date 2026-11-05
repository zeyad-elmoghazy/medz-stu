import * as fs from 'fs';
import * as path from 'path';
import { IDLES, idleKeyframes } from '@/lib/mascot/idles';
import { POSES, type IdleKind } from '@/lib/mascot/poses';

const KINDS = Object.keys(IDLES) as IdleKind[];

describe('idle loops', () => {
  it('covers every idle kind a pose can ask for', () => {
    for (const pose of Object.values(POSES)) expect(IDLES[pose.idle]).toBeDefined();
    expect(KINDS.sort()).toEqual(['bob', 'bounce', 'breathe', 'nod', 'pump', 'shake', 'sway', 'tremble']);
  });

  it.each(KINDS)('%s: every keyframe track matches the times array', (kind) => {
    const s = IDLES[kind];
    expect(s.duration).toBeGreaterThan(0);
    expect(s.times[0]).toBe(0);
    expect(s.times[s.times.length - 1]).toBe(1);
    for (let i = 1; i < s.times.length; i += 1) expect(s.times[i]).toBeGreaterThan(s.times[i - 1]);
    for (const track of [s.x, s.y, s.rotate, s.scale]) {
      if (track) expect(track).toHaveLength(s.times.length);
    }
  });

  it.each(KINDS)('%s: loops back to where it started (no jump when the loop repeats)', (kind) => {
    const kf = idleKeyframes(IDLES[kind]);
    expect(kf[0].transform).toBe(kf[kf.length - 1].transform);
  });

  it.each(KINDS)('%s: starts at the neutral pose so it joins the landing smoothly', (kind) => {
    expect(idleKeyframes(IDLES[kind])[0].transform).toBe('translate(0%, 0%) rotate(0deg) scale(1)');
  });

  it.each(KINDS)('%s: moves are small enough to stay inside the stage', (kind) => {
    const s = IDLES[kind];
    for (const v of [...(s.x ?? []), ...(s.y ?? [])]) expect(Math.abs(parseFloat(v))).toBeLessThanOrEqual(10);
    for (const v of s.scale ?? []) {
      expect(v).toBeGreaterThan(0.9);
      expect(v).toBeLessThan(1.1);
    }
    for (const v of s.rotate ?? []) expect(Math.abs(v)).toBeLessThanOrEqual(5);
  });

  it('builds one CSS transform keyframe per time stop', () => {
    const kf = idleKeyframes(IDLES.pump);
    expect(kf).toHaveLength(IDLES.pump.times.length);
    expect(kf[1]).toMatchObject({ offset: 0.12, transform: 'translate(0%, -0.8%) rotate(0deg) scale(1.045)' });
  });
});

/**
 * Bueno's width-to-height ratio must hold at every moment, on every screen size. Squashing him
 * sideways (scaling one axis alone) reads as a distorted mascot, so no mascot file may do it.
 */
describe('proportions never change', () => {
  const FILES = [
    'lib/mascot/idles.ts',
    'lib/mascot/poses.ts',
    'components/mascot/Bueno.tsx',
    'components/mascot/BuenoAccessory.tsx',
    'components/mascot/BuenoCard.tsx',
    'components/mascot/Confetti.tsx',
    // (MascotHost.tsx is not listed: its only scaleX grows the rescue meter's progress bar, not Bueno.)
    'components/mascot/ProudBueno.tsx',
    'components/mascot/ResultsBueno.tsx',
    'components/mascot/StreakCelebration.tsx',
  ];
  const code = (file: string) =>
    fs
      .readFileSync(path.join(process.cwd(), file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(FILES)('%s never scales one axis alone', (file) => {
    const src = code(file);
    expect(src).not.toMatch(/scale[XY]\b/);
    expect(src).not.toMatch(/scale\([^()]*,[^()]*\)/);
  });

  it('every idle keeps one scale per keyframe, so both axes always move together', () => {
    for (const spec of Object.values(IDLES)) {
      expect(Object.keys(spec)).not.toContain('scaleX');
      expect(Object.keys(spec)).not.toContain('scaleY');
    }
  });

  it('the figure box cannot be squeezed by a layout, and the artwork cannot stretch', () => {
    const src = code('components/mascot/Bueno.tsx');
    expect(src).toMatch(/aspectRatio/);
    expect(src).toMatch(/flexShrink:\s*0/);
    expect(src).toMatch(/objectFit:\s*'contain'/);
  });
});
