'use client';

import Image from 'next/image';
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { BuenoAccessory } from '@/components/mascot/BuenoAccessory';
import { IDLES, idleKeyframes } from '@/lib/mascot/idles';
import type { Accessory } from '@/lib/mascot/milestones';
import { CANVAS, POSES, REST_LAYERS, TIMELINE, WAVE, type PoseId } from '@/lib/mascot/poses';

/**
 * Bueno, the MediZee skeleton. Every appearance plays the same choreography:
 *
 *   pop in standing in his ORIGINAL pose -> crouch -> hop with a stretch ->
 *   cross-fade into the situation pose at the top of the hop -> land with a squash
 *   -> idle loop for that pose.
 *
 * The old waving-arm layer never moves on the way into a pose (a raised arm
 * before the pose read as a bug). Only `pose="rest"` waves, which is the friendly
 * hello used by the daily greeting. People who prefer reduced motion get the
 * finished pose after a short fade, with no travel and no looping.
 *
 * Remount (change `key`) to replay; `pose` is read when the component mounts.
 */
export type BuenoProps = {
  pose: PoseId;
  accessory?: Accessory | null;
  /** Width in px or any CSS length; the height follows the 800:1100 artwork. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Accessible description; the pose images themselves are decorative. */
  label?: string;
  /** Click or press Enter/Space to make him rattle (the easter egg). */
  interactive?: boolean;
  onPoke?: () => void;
};

const E_SPRING = 'cubic-bezier(.34,1.56,.64,1)';
const E_OUT = 'cubic-bezier(.2,.8,.2,1)';
const E_IN = 'cubic-bezier(.55,0,.85,.4)';
const E_IO = 'cubic-bezier(.45,0,.25,1)';

const fill: CSSProperties = { position: 'absolute', inset: 0 };
const img: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  // If a box ever ended up a different shape from the artwork, letterbox it rather than stretch it.
  objectFit: 'contain',
  display: 'block',
  userSelect: 'none',
  pointerEvents: 'none',
};

export function Bueno({
  pose,
  accessory = null,
  size = 220,
  className,
  style,
  label = 'Bueno, the MediZee skeleton mascot',
  interactive = false,
  onPoke,
}: BuenoProps) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const spec = POSES[pose];
  const isRest = pose === 'rest';

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const part = (name: string) => el.querySelector<HTMLElement>(`[data-b="${name}"]`);
    const enter = part('enter');
    const hop = part('hop');
    const rest = part('rest');
    const arm = part('arm');
    const head = part('head');
    const posed = part('pose');
    const shadow = part('shadow');
    if (!enter || !hop || !rest) return;

    const anims: Animation[] = [];
    const run = (target: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!target) return;
      // fill 'forwards' only: a later segment must not apply its first keyframe during its own
      // start delay, or it would override the earlier segments of the same element.
      const a = target.animate(keyframes, { fill: 'forwards', ...options });
      a.persist?.(); // finished segments overridden by later ones would otherwise be garbage-collected
      anims.push(a);
    };

    if (reduce) {
      // Finished pose after a short fade: no travel, no loops.
      if (!isRest) {
        rest.style.opacity = '0';
        if (posed) posed.style.opacity = '1';
      }
      run(enter, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      return () => anims.forEach((a) => a.cancel());
    }

    const T = TIMELINE;
    run(enter, [
      { opacity: 0, transform: 'translateY(9%) scale(.55)' },
      { opacity: 1, transform: 'none' },
    ], { duration: T.enter, easing: E_SPRING });
    run(shadow, [{ opacity: 0 }, { opacity: 1 }], { duration: 350 });

    if (isRest) {
      // The friendly hello: a wave every few seconds, a little head tilt, a gentle bob.
      const loop = WAVE.loopEvery;
      const at = (ms: number) => ms / loop;
      run(arm, [
        { offset: 0, transform: 'rotate(0deg)' },
        { offset: at(WAVE.duration * 0.22), transform: 'rotate(-122deg)' },
        { offset: at(WAVE.duration * 0.4), transform: 'rotate(-104deg)' },
        { offset: at(WAVE.duration * 0.58), transform: 'rotate(-134deg)' },
        { offset: at(WAVE.duration * 0.78), transform: 'rotate(-108deg)' },
        { offset: at(WAVE.duration), transform: 'rotate(0deg)' },
        { offset: 1, transform: 'rotate(0deg)' },
      ], { duration: loop, delay: WAVE.startAt, iterations: Infinity, easing: E_IO });
      run(head, [
        { transform: 'rotate(-3deg)' },
        { transform: 'rotate(4deg)' },
        { transform: 'rotate(-3deg)' },
      ], { duration: 3600, delay: T.enter, iterations: Infinity, easing: 'ease-in-out' });
      run(hop, idleKeyframes(IDLES.bob), { duration: IDLES.bob.duration, delay: T.enter, iterations: Infinity, easing: 'ease-in-out' });
    } else {
      // Uniform scale only: Bueno's proportions must hold at every moment of the animation.
      const crouch = `translateY(2%) scale(${spec.crouch})`;
      const top = `translateY(${spec.hop}%) scale(${spec.peak})`;

      // crouch
      run(hop, [{ transform: 'none' }, { transform: crouch }], {
        duration: T.launchAt - T.crouchAt, delay: T.crouchAt, easing: E_IN,
      });
      // launch: stretch and hop; the arm stays down
      run(hop, [{ transform: crouch }, { transform: top }], {
        duration: T.landAt - T.launchAt, delay: T.launchAt, easing: E_OUT,
      });
      run(head, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${spec.headTo}deg)` }], {
        duration: T.swapAt - T.launchAt + 60, delay: T.launchAt, easing: E_OUT,
      });
      // cross-fade original -> pose while airborne
      run(rest, [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 1, filter: 'blur(1.4px)', offset: 0.4 }, { opacity: 0, filter: 'blur(2px)' }], {
        duration: T.crossfade, delay: T.swapAt, easing: 'linear',
      });
      run(posed, [{ opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0px)' }], {
        duration: T.crossfade, delay: T.swapAt, easing: 'linear',
      });
      // land: squash, then settle
      run(hop, [
        { transform: top },
        { transform: `translateY(1%) scale(${spec.crouch})`, offset: 0.55 },
        { transform: 'none' },
      ], { duration: T.idleAt - T.landAt, delay: T.landAt, easing: E_SPRING });
      // idle for this pose
      const idle = IDLES[spec.idle];
      run(hop, idleKeyframes(idle), { duration: idle.duration, delay: T.idleAt, iterations: Infinity, easing: idle.easing });
    }

    return () => anims.forEach((a) => a.cancel());
  }, [pose, reduce, isRest, spec]);

  function poke() {
    const el = root.current?.querySelector<HTMLElement>('[data-b="poke"]');
    if (el && !reduce) {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { transform: 'translateX(0) rotate(0deg)' },
          { transform: 'translateX(-4%) rotate(-4deg)', offset: 0.12 },
          { transform: 'translateX(4%) rotate(4deg)', offset: 0.28 },
          { transform: 'translateX(-3%) rotate(-3deg)', offset: 0.44 },
          { transform: 'translateX(3%) rotate(3deg)', offset: 0.6 },
          { transform: 'translateX(-1.5%) rotate(-1.5deg)', offset: 0.78 },
          { transform: 'translateX(0) rotate(0deg)' },
        ],
        { duration: 520, easing: 'ease-out' }
      );
    }
    onPoke?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      poke();
    }
  }

  return (
    <div
      ref={root}
      role={interactive ? 'button' : 'img'}
      aria-label={interactive ? `${label}. Poke him for a joke.` : label}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? poke : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      className={className}
      style={{
        position: 'relative',
        width: typeof size === 'number' ? `${size}px` : size,
        aspectRatio: `${CANVAS.width} / ${CANVAS.height}`,
        // Never squeezed by a flex/grid parent, and never wider than the room there is (the height
        // follows the aspect ratio either way, so he only ever scales, never distorts).
        flexShrink: 0,
        maxWidth: '100%',
        cursor: interactive ? 'pointer' : undefined,
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      <div
        data-b="shadow"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '30%',
          right: '30%',
          bottom: '3.6%',
          height: '3.4%',
          borderRadius: '50%',
          background: 'var(--bueno-shadow, rgba(0,0,0,.30))',
          filter: 'blur(7px)',
          opacity: 0,
        }}
      />
      <div data-b="poke" style={fill}>
        <div data-b="enter" style={{ ...fill, opacity: 0 }}>
          <div data-b="hop" style={fill}>
            <div data-b="rest" style={fill}>
              <Image src={REST_LAYERS.body} alt="" width={CANVAS.width} height={CANVAS.height} unoptimized style={img} />
              <div data-b="arm" style={{ ...fill, transformOrigin: `${REST_LAYERS.armPivot.x}% ${REST_LAYERS.armPivot.y}%` }}>
                <Image src={REST_LAYERS.arm} alt="" width={CANVAS.width} height={CANVAS.height} unoptimized style={img} />
              </div>
              <div data-b="head" style={{ ...fill, transformOrigin: `${REST_LAYERS.headPivot.x}% ${REST_LAYERS.headPivot.y}%` }}>
                <Image src={REST_LAYERS.head} alt="" width={CANVAS.width} height={CANVAS.height} unoptimized style={img} />
              </div>
            </div>
            {spec.src && (
              <div data-b="pose" style={{ ...fill, opacity: 0 }}>
                <Image src={spec.src} alt="" width={CANVAS.width} height={CANVAS.height} unoptimized loading="eager" style={img} />
              </div>
            )}
            {accessory && <BuenoAccessory kind={accessory} skull={spec.skull} appearAtMs={reduce ? 0 : TIMELINE.landAt} />}
          </div>
        </div>
      </div>
    </div>
  );
}
