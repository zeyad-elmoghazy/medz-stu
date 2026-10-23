import type { CSSProperties } from 'react';

/**
 * Loading skeletons for the dynamic /student routes, one per page shape.
 *
 * app/(student)/student/loading.tsx already shows a (dashboard-shaped) skeleton
 * while a student route loads. These give the catalogue, quiz and results pages a
 * skeleton that matches their own layout instead, so the placeholder doesn't flash
 * a dashboard over a quiz. They are plain static markup (no client components).
 */

function Block({ w, h, r = 8, style }: { w: number | string; h: number; r?: number; style?: CSSProperties }) {
  return <div className="skeleton-shimmer" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Stand-in for StudentNavbar so the page chrome doesn't jump. */
function NavPlaceholder() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, height: 64, padding: '0 44px' }}>
      <Block w={110} h={28} />
      <Block w={280} h={28} r={9999} style={{ maxWidth: '40%' }} />
      <Block w={90} h={28} r={9999} />
    </div>
  );
}

/** Catalogue screens (year / module / subject): navbar placeholder, title, card grid. */
export function CatalogueSkeleton() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }} aria-busy="true" aria-live="polite">
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <NavPlaceholder />
        <section style={{ padding: '30px 44px 64px' }}>
          <Block w={180} h={12} r={9999} style={{ marginBottom: 22 }} />
          <Block w={320} h={34} style={{ marginBottom: 12, maxWidth: '100%' }} />
          <Block w={520} h={14} style={{ marginBottom: 28, maxWidth: '100%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Block key={i} w="100%" h={168} r={16} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Chapter / custom-exam quiz: top bar, question, answer options. */
export function QuizPageSkeleton() {
  return (
    <main
      className="relative min-h-screen w-full"
      style={{ backgroundColor: 'var(--bg)' }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Block w={140} h={32} />
        <Block w="40%" h={8} r={9999} />
        <Block w={120} h={32} />
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 pt-12">
        <Block w={120} h={22} r={9999} style={{ marginBottom: 20 }} />
        <Block w="90%" h={30} style={{ marginBottom: 12 }} />
        <Block w="60%" h={30} style={{ marginBottom: 28 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} w="100%" h={56} r={14} style={{ marginBottom: 12 }} />
        ))}
        <Block w="100%" h={52} r={14} style={{ marginTop: 20 }} />
      </div>
    </main>
  );
}

/** Results screens (chapter / exam): header bar, score card, stat cards. */
export function ResultsSkeleton() {
  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: 'var(--bg)' }} aria-busy="true" aria-live="polite">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Block w={140} h={28} />
        <Block w={100} h={32} />
      </div>
      <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-14">
        <Block w="100%" h={220} r={20} style={{ marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Block key={i} w="100%" h={120} r={16} />
          ))}
        </div>
      </div>
    </main>
  );
}
