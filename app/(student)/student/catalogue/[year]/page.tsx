'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
              color: '#00A6A6',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {yearData?.label ?? ''}
          </div>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', color: '#F7F9FA' }}>
            Year {year} Modules
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 13.5, color: '#8B98A6', maxWidth: 560, lineHeight: 1.6 }}>
            Each module bundles the subjects taught alongside it that term.
          </p>
        </div>
        {yearData && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#33BFBF',
              background: 'rgba(0,166,166,0.14)',
              border: '1px solid rgba(0,166,166,0.4)',
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
        <div role="alert" style={{ padding: '12px 16px', color: '#FCA5A5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!yearData && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8B98A6', fontSize: 13, padding: 40 }}>
          <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
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
                background: '#132B45',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div
                style={{
                  padding: '16px 18px 14px',
                  background: 'linear-gradient(135deg,rgba(0,166,166,0.12),rgba(0,166,166,0.03))',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: 'ui-monospace,Menlo,monospace',
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: '#33BFBF',
                      background: 'rgba(0,166,166,0.16)',
                      border: '1px solid rgba(0,166,166,0.35)',
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
                        color: '#8B98A6',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        flex: 'none',
                      }}
                    >
                      Coming soon
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 12, letterSpacing: '-0.01em', color: '#F7F9FA' }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 11.5, color: '#8B98A6', marginTop: 6 }}>
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
                    color: '#8B98A6',
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
                        color: '#D9F3F0',
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
                    color: '#33BFBF',
                    border: '1px solid rgba(0,166,166,0.4)',
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
