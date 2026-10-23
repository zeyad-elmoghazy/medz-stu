import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';

// Shown by Next the moment a /student/* link is clicked, while the next
// route's payload streams in — instead of a frozen page.
export default function StudentLoading() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <DashboardSkeleton />
      </div>
    </main>
  );
}
