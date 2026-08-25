'use client';

import { StudentNavbar } from '@/components/student/StudentNavbar';

/**
 * Shared page background + navbar for every /student/catalogue/*
 * screen — ported from the mockup's outer wrapper (radial teal glow
 * + dotted grid texture on Deep Navy).
 */
export function CatalogueShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0B1F33' }}>
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          position: 'relative',
          background:
            'radial-gradient(900px 520px at 88% -6%, rgba(0,166,166,0.28), transparent 60%),' +
            'radial-gradient(700px 480px at 6% 30%, rgba(0,166,166,0.10), transparent 55%),' +
            '#0B1F33',
          paddingBottom: 8,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        />
        <StudentNavbar activeLabel="Catalogue" />
        <section style={{ position: 'relative', padding: '30px 44px 64px' }}>{children}</section>
      </div>
    </div>
  );
}
