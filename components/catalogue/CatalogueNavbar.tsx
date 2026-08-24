'use client';

import Link from 'next/link';
import { MediZeeLogo } from '@/components/brand/MediZeeLogo';

/**
 * Nav bar for /student/catalogue/*, ported from the mockup
 * (Student Catalogue.dc.html) rather than the shared StudentNavbar —
 * the mockup's nav is a genuinely different, simpler set (Home /
 * Catalogue / Custom Exam / Leaderboard + a streak badge, no "My
 * Progress" CTA, theme toggle, or logout) and its own logic never
 * wires an onClick to Custom Exam or Leaderboard despite the
 * cursor:pointer styling — both are inert by the mockup's own
 * design, not an oversight. Left deliberately separate from
 * StudentNavbar rather than changed in place, since that component
 * is shared across every other /student page and its "Custom Exam"
 * link is real (points at /student/exam) — matching the mockup here
 * would have silently regressed that link everywhere else.
 */
export function CatalogueNavbar() {
  return (
    <nav
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 34px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <MediZeeLogo size="sm" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}>
        <Link href="/student/dashboard" style={{ color: '#8B98A6', textDecoration: 'none' }}>
          Home
        </Link>
        <span style={{ color: '#F7F9FA', fontWeight: 700 }}>Catalogue</span>
        <span style={{ color: '#8B98A6', cursor: 'default' }}>Custom Exam</span>
        <span style={{ color: '#8B98A6', cursor: 'default' }}>Leaderboard</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            fontWeight: 700,
            color: '#8B98A6',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            padding: '7px 12px',
            borderRadius: 9,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B98A6" strokeWidth="2">
            <path d="M12 2c1 4-4 5-4 9a4 4 0 008 0c0-1.5-1-2-1-3.5 2 1 3 3.5 3 5.5a6 6 0 11-12 0c0-4 3-6 4-8 .5 1 1 1.5 2 1z" />
          </svg>
          0-day streak
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#F7F9FA',
          }}
        >
          ST
        </div>
      </div>
    </nav>
  );
}
