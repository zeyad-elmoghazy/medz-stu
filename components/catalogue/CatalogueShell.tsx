'use client';

import { StudentNavbar } from '@/components/student/StudentNavbar';

/**
 * Shared page background + navbar for every /student/catalogue/*
 * screen.
 */
export function CatalogueShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', paddingBottom: 8 }}>
        <StudentNavbar activeLabel="Catalogue" />
        <section style={{ position: 'relative', padding: '30px 44px 64px' }}>{children}</section>
      </div>
    </div>
  );
}
