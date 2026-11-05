'use client';

import { BuenoCard } from '@/components/mascot/BuenoCard';
import { Confetti } from '@/components/mascot/Confetti';
import { improvementLine, pick, RESULT_COPY } from '@/lib/mascot/copy';
import { tierForAccuracy } from '@/lib/mascot/tiers';
import type { PoseId } from '@/lib/mascot/poses';

/**
 * Bueno's reaction to a finished quiz, shown at the top of both results pages.
 * It is driven by the same rounded accuracy the page displays, so the number on
 * screen and Bueno's pose can never disagree.
 *
 *   100% flex + crown + confetti · 90+ flex · 75+ thumbs up
 *   50+ straight face "You can do better." · below 50 arms crossed "Go Study."
 */
export function ResultsBueno({
  accuracy,
  correct,
  total,
  previousAccuracy = null,
}: {
  /** The displayed accuracy, already rounded to a whole percent. */
  accuracy: number;
  correct: number;
  total: number;
  /** Accuracy of the previous attempt in this chapter, if there was one. */
  previousAccuracy?: number | null;
}) {
  const tier = tierForAccuracy(accuracy);
  const copy = RESULT_COPY[tier];
  // Seed from the result itself: stable across re-renders and identical on server and client.
  const seed = correct * 31 + total * 7 + accuracy;
  const pose: PoseId = tier === 'perfect' ? 'flex' : tier;

  return (
    <div
      data-testid="results-bueno"
      data-tier={tier}
      data-pose={pose}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--fill)',
        border: '1px solid var(--line)',
        borderRadius: 20,
        padding: 'clamp(8px, 2vw, 16px) clamp(8px, 2vw, 20px)',
      }}
    >
      {tier === 'perfect' && <Confetti seed={accuracy + total} delayMs={900} />}
      <BuenoCard
        key={`${tier}-${correct}-${total}`}
        pose={pose}
        accessory={tier === 'perfect' ? 'crown' : null}
        headline={pick(copy.main, seed)}
        body={pick(copy.sub, seed + 1)}
        extra={improvementLine(previousAccuracy, accuracy)}
      />
    </div>
  );
}
