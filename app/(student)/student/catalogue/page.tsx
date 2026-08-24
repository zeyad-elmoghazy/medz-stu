'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
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
              color: '#00A6A6',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            The MediZee Catalogue
          </div>
          <h1 style={{ margin: 0, fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', color: '#F7F9FA' }}>
            Choose your year
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 14, color: '#8B98A6', maxWidth: 560, lineHeight: 1.6 }}>
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
                color: '#33BFBF',
                background: 'rgba(0,166,166,0.14)',
                border: '1px solid rgba(0,166,166,0.4)',
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
                color: '#8B98A6',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
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
        <div role="alert" style={{ padding: '12px 16px', color: '#FCA5A5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8B98A6', fontSize: 13, padding: 40 }}>
          <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
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
                background: 'linear-gradient(165deg,#132B45,#0B1F33)',
                border: '1px solid rgba(0,166,166,0.35)',
                boxShadow: '0 0 0 1px rgba(0,166,166,0.14), 0 20px 60px -24px rgba(0,0,0,0.6)',
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
                  background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#F7F9FA',
                  boxShadow: '0 0 18px rgba(0,166,166,0.45)',
                  marginBottom: 18,
                }}
              >
                {y.year}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', color: '#F7F9FA' }}>
                Year {y.year}
              </div>
              <div style={{ fontSize: 12, color: '#8B98A6', marginTop: 4 }}>{y.label}</div>
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid rgba(255,255,255,0.07)',
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
                  background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                  padding: 10,
                  borderRadius: 10,
                  boxShadow: '0 0 18px rgba(0,166,166,0.35)',
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
      <div style={{ fontSize: 17, fontWeight: 800, color: '#33BFBF' }}>{value}</div>
      <div
        style={{
          fontSize: 9.5,
          color: '#8B98A6',
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
