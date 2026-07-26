/**
 * DashboardSkeleton — placeholder for the bento-grid dashboards
 * (admin, student, professor). Renders the section frame for the
 * top stats row plus two columns of bento panels so the layout
 * shape is stable before the real components hydrate.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div
            className="skeleton-shimmer"
            style={{ width: '140px', height: '10px', borderRadius: '9999px' }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '260px', height: '32px', borderRadius: '0.5rem' }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '360px', height: '14px', borderRadius: '0.375rem' }}
          />
        </div>
        <div
          className="skeleton-shimmer"
          style={{ width: '120px', height: '28px', borderRadius: '9999px' }}
        />
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <PanelFrame key={i} height="148px" />
        ))}
      </div>

      {/* Bento grid */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <PanelFrame height="320px" />
          <PanelFrame height="260px" />
        </div>
        <div className="flex flex-col gap-6">
          <PanelFrame height="220px" />
          <PanelFrame height="280px" />
          <PanelFrame height="200px" />
        </div>
      </div>
    </div>
  );
}

function PanelFrame({ height }: { height: string }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div
        className="skeleton-shimmer"
        style={{ width: '60%', height: '16px', borderRadius: '0.375rem' }}
      />
      <div
        className="mt-3 skeleton-shimmer"
        style={{ width: '40%', height: '10px', borderRadius: '0.375rem' }}
      />
      <div
        className="mt-5 skeleton-shimmer"
        style={{
          width: '100%',
          height,
          borderRadius: '0.75rem',
          maxHeight: '100%',
        }}
      />
    </div>
  );
}
