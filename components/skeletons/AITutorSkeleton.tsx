/**
 * AITutorSkeleton — placeholder rendered by next/dynamic while
 * the AITutor chunk (chat UI + framer motion + future markdown
 * pipeline) streams in.
 */
export function AITutorSkeleton() {
  return (
    <div
      className="flex h-full flex-col rounded-2xl"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="flex items-center justify-between gap-2 p-4"
        style={{ borderBottom: '1px solid #1E1E2E' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="skeleton-shimmer"
            style={{ width: '32px', height: '32px', borderRadius: '0.5rem' }}
          />
          <div className="flex flex-col gap-1.5">
            <span
              className="skeleton-shimmer block"
              style={{ width: '90px', height: '10px', borderRadius: '0.375rem' }}
            />
            <span
              className="skeleton-shimmer block"
              style={{ width: '160px', height: '14px', borderRadius: '0.375rem' }}
            />
          </div>
        </div>
        <span
          className="skeleton-shimmer"
          style={{ width: '32px', height: '32px', borderRadius: '0.5rem' }}
        />
      </div>

      <div className="flex-1 space-y-2.5 p-4">
        <div
          className="skeleton-shimmer"
          style={{ width: '70%', height: '36px', borderRadius: '0.75rem' }}
        />
        <div className="flex justify-end">
          <div
            className="skeleton-shimmer"
            style={{ width: '55%', height: '32px', borderRadius: '0.75rem' }}
          />
        </div>
        <div
          className="skeleton-shimmer"
          style={{ width: '80%', height: '48px', borderRadius: '0.75rem' }}
        />
      </div>

      <div
        className="flex items-center gap-2 p-3"
        style={{ borderTop: '1px solid #1E1E2E' }}
      >
        <div
          className="skeleton-shimmer h-10 flex-1"
          style={{ borderRadius: '0.5rem' }}
        />
        <div
          className="skeleton-shimmer"
          style={{ width: '40px', height: '40px', borderRadius: '0.5rem' }}
        />
      </div>
    </div>
  );
}
