'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SpinnerIcon } from '@/components/icons';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchModulesByYear, type ModulesByYear } from '@/lib/catalogue-api';

export default function CatalogueYearsPage() {
  const [data, setData] = useState<ModulesByYear | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModulesByYear()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CatalogueShell>
      <CatalogueBreadcrumb crumbs={[{ label: 'Home' }]} />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 28,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: 'var(--accent-text)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            The MediZee Catalogue
          </div>
          <h1 style={{ margin: 0, fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            Choose your year
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text3)', maxWidth: 560, lineHeight: 1.6 }}>
            Every module, subject and chapter in the curriculum is organized the way your program
            teaches it.
          </p>
        </div>
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent-text)',
                background: 'var(--line2)',
                border: '1px solid var(--line2)',
                padding: '8px 14px',
                borderRadius: 10,
              }}
            >
              {data.totals.modules} modules
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text3)',
                background: 'var(--fill)',
                border: '1px solid var(--line)',
                padding: '8px 14px',
                borderRadius: 10,
              }}
            >
              {data.totals.chapters} chapters
            </span>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', color: 'var(--error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: 40 }}>
          <SpinnerIcon size={16} className="animate-spin" />
          Loading years…
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {data.years.map((y) => (
            <Link
              key={y.year}
              href={`/student/catalogue/${y.year}`}
              style={{
                cursor: 'pointer',
                position: 'relative',
                borderRadius: 18,
                overflow: 'hidden',
                background: 'var(--surface)',
                border: '1px solid var(--line2)',
                padding: 26,
                textDecoration: 'none',
                display: 'block',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'var(--accent-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#F7F9FA',
                  marginBottom: 18,
                }}
              >
                {y.year}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                Year {y.year}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{y.label}</div>
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--line)',
                }}
              >
                <StatCell value={y.moduleCount} label="Modules" />
                <StatCell value={y.subjectCount} label="Subjects" />
                <StatCell value={y.chapterCount} label="Chapters" />
              </div>
              <div
                style={{
                  marginTop: 20,
                  textAlign: 'center',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#F7F9FA',
                  background: 'var(--accent-text)',
                  padding: 10,
                  borderRadius: 10,
                }}
              >
                Browse Modules →
              </div>
            </Link>
          ))}
        </div>
      )}
    </CatalogueShell>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent-text)' }}>{value}</div>
      <div
        style={{
          fontSize: 9.5,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
