/**
 * QuizSkeleton — placeholder for the Question + 4 choices layout.
 *
 * Mirrors the real PhaseOne component so the page doesn't lurch
 * when the quiz engine code-split chunk hydrates.
 */
export function QuizSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      {/* Topic chip */}
      <div
        className="skeleton-shimmer"
        style={{ width: '160px', height: '22px', borderRadius: '9999px' }}
      />

      {/* Question stem — three lines */}
      <div className="space-y-3">
        <div
          className="skeleton-shimmer"
          style={{ width: '100%', height: '20px', borderRadius: '0.375rem' }}
        />
        <div
          className="skeleton-shimmer"
          style={{ width: '94%', height: '20px', borderRadius: '0.375rem' }}
        />
        <div
          className="skeleton-shimmer"
          style={{ width: '68%', height: '20px', borderRadius: '0.375rem' }}
        />
      </div>

      {/* Four choices */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <ChoiceSkeleton key={i} widthPct={88 - i * 4} />
        ))}
      </div>

      {/* Submit button placeholder */}
      <div
        className="skeleton-shimmer"
        style={{ width: '100%', height: '48px', borderRadius: '0.75rem' }}
      />
    </div>
  );
}

function ChoiceSkeleton({ widthPct }: { widthPct: number }) {
  return (
    <div
      className="flex items-start gap-4 rounded-xl p-4"
      style={{
        backgroundColor: '#0F0F1A',
        border: '1px solid #1E1E2E',
      }}
    >
      <span
        className="skeleton-shimmer mt-0.5 inline-block shrink-0"
        style={{ width: '32px', height: '32px', borderRadius: '0.5rem' }}
      />
      <span className="flex-1 pt-1">
        <span
          className="skeleton-shimmer block"
          style={{
            width: `${widthPct}%`,
            height: '16px',
            borderRadius: '0.375rem',
          }}
        />
      </span>
    </div>
  );
}
