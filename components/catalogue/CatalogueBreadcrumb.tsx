'use client';

import Link from 'next/link';

export type Crumb = { label: string; href?: string };

export function CatalogueBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--text3)',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {c.href && !isLast ? (
              <Link href={c.href} style={{ color: 'var(--text3)', textDecoration: 'none' }}>
                {c.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? 'var(--accent-text)' : 'var(--text3)', fontWeight: isLast ? 600 : 400 }}>
                {c.label}
              </span>
            )}
            {!isLast && <span style={{ color: 'var(--faint)' }}>›</span>}
          </span>
        );
      })}
    </div>
  );
}
