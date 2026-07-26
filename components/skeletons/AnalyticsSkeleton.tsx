/**
 * AnalyticsSkeleton — visual placeholder shown while the
 * Recharts-powered Analytics chunk streams in.
 *
 * The layout mirrors the real Analytics component exactly (KPI
 * grid + chart frame) so the page doesn't visually jump when the
 * real component replaces it.
 */
export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      {/* Chart panel */}
      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
      >
        <div className="flex items-baseline justify-between">
          <div className="flex flex-col gap-2">
            <SkeletonBar w="120px" h="10px" />
            <SkeletonBar w="180px" h="16px" />
            <SkeletonBar w="220px" h="10px" />
          </div>
          <SkeletonBar w="80px" h="22px" radius="9999px" />
        </div>
        <div className="mt-6 h-56 w-full skeleton-shimmer rounded-xl" />
      </div>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <SkeletonBar w="36px" h="36px" radius="0.5rem" />
      <div className="mt-5">
        <SkeletonBar w="80px" h="28px" />
      </div>
      <div className="mt-2">
        <SkeletonBar w="120px" h="10px" />
      </div>
      <div className="mt-3">
        <SkeletonBar w="160px" h="10px" />
      </div>
    </div>
  );
}

function SkeletonBar({
  w,
  h,
  radius = '0.375rem',
}: {
  w: string;
  h: string;
  radius?: string;
}) {
  return (
    <span
      aria-hidden
      className="skeleton-shimmer block"
      style={{ width: w, height: h, borderRadius: radius }}
    />
  );
}
