'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { SpinnerIcon } from '@/components/icons';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchModulesByYear, type CatalogueYear } from '@/lib/catalogue-api';

export default function CatalogueModulesPage() {
  const params = useParams<{ year: string }>();
  const year = Number(params.year);

  const [yearData, setYearData] = useState<CatalogueYear | null>(null);
  const [notFoundYear, setNotFoundYear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModulesByYear()
      .then((d) => {
        if (cancelled) return;
        const found = d.years.find((y) => y.year === year);
        if (!found) {
          setNotFoundYear(true);
          return;
        }
        setYearData(found);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (notFoundYear) notFound();

  return (
    <CatalogueShell>
      <CatalogueBreadcrumb
        crumbs={[
          { label: 'Home', href: '/student/catalogue' },
          { label: `Year ${year}` },
        ]}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 26,
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
            {yearData?.label ?? ''}
          </div>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            Year {year} Modules
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 13.5, color: 'var(--text3)', maxWidth: 560, lineHeight: 1.6 }}>
            Each module bundles the subjects taught alongside it that term.
          </p>
        </div>
        {yearData && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-text)',
              background: 'var(--line2)',
              border: '1px solid var(--line2)',
              padding: '8px 14px',
              borderRadius: 10,
              flex: 'none',
            }}
          >
            {yearData.modules.length} modules
          </span>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', color: 'var(--error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!yearData && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: 40 }}>
          <SpinnerIcon size={16} className="animate-spin" />
          Loading modules…
        </div>
      )}

      {yearData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {yearData.modules.map((m) => (
            <div
              key={m.code}
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 16,
                overflow: 'hidden',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  padding: '16px 18px 14px',
                  background: 'var(--fill)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: 'ui-monospace,Menlo,monospace',
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'var(--accent-text)',
                      background: 'var(--line2)',
                      border: '1px solid var(--line2)',
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    MODULE {m.code}
                  </span>
                  {/* Real data, not a hardcoded per-card flag: a module
                      shows "Coming soon" only when publishedCount (the
                      sum of chapters.published_count across every
                      chapter in this module, computed server-side) is
                      zero — a partially-live module like 205 (one
                      published chapter out of many) never shows it. */}
                  {m.publishedCount === 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text3)',
                        background: 'var(--fill)',
                        border: '1px solid var(--line2)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        flex: 'none',
                      }}
                    >
                      Coming soon
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 12, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>
                  {m.chapterCount} chapters · {m.publishedCount} published question{m.publishedCount === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ padding: '14px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text3)',
                    marginBottom: 9,
                  }}
                >
                  {m.subjectCount} Subjects
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {m.subjectNames.map((name) => (
                    <span
                      key={name}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--accent-text)',
                        background: 'rgba(217,243,240,0.06)',
                        border: '1px solid rgba(217,243,240,0.16)',
                        padding: '5px 10px',
                        borderRadius: 7,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/student/catalogue/${year}/${m.code}`}
                  style={{
                    marginTop: 'auto',
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--accent-text)',
                    border: '1px solid var(--line2)',
                    padding: 9,
                    borderRadius: 9,
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  View Subjects →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </CatalogueShell>
  );
}
