'use client';

import { BuenoCard } from '@/components/mascot/BuenoCard';
import { pickProudMessage } from '@/lib/mascot/proud';
import type { StudentStats } from '@/lib/dashboard-data';

/**
 * Bueno beaming at the top of the Progress page. The message is picked from the
 * student's real numbers (streak, accuracy trend, volume), never invented.
 */
export function ProudBueno({ stats, loading }: { stats: StudentStats; loading: boolean }) {
  // Nothing while the numbers are still loading: a premature "first quiz" nudge would flash.
  if (loading) return null;

  const message = pickProudMessage(
    {
      totalQuestionsAnswered: stats.totalQuestionsAnswered,
      overallAccuracy: stats.overallAccuracy,
      streakDays: stats.streakDays,
      progressHistory: stats.progressHistory,
      mistakesToReview: stats.mistakes.reduce((n, m) => n + m.questionIds.length, 0),
    },
    stats.totalQuestionsAnswered
  );

  return (
    <div
      data-testid="proud-bueno"
      data-kind={message.kind}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 20,
        padding: 'clamp(8px, 2vw, 14px) clamp(8px, 2vw, 20px)',
      }}
    >
      <BuenoCard
        key={`${message.kind}-${message.headline}`}
        pose={message.pose}
        size="clamp(92px, 24vw, 150px)"
        headline={message.headline}
        body={message.body}
      />
    </div>
  );
}
