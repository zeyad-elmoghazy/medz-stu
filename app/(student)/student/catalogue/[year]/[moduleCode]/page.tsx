'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { SpinnerIcon } from '@/components/icons';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchSubjectsByModule, type SubjectsByModule } from '@/lib/catalogue-api';
import { getSubjectImage } from '@/lib/subject-images';

function initialsOf(name: string): string {
  const words = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return ((words[0][0] || '') + (words[1][0] || '')).toUpperCase();
  return (words[0] || '').slice(0, 2).toUpperCase();
}

export default function CatalogueSubjectsPage() {
  const params = useParams<{ year: string; moduleCode: string }>();
  const year = params.year;
  const moduleCode = params.moduleCode;

  const [data, setData] = useState<SubjectsByModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSubjectsByModule(moduleCode)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [moduleCode]);

  return (
    <CatalogueShell>
      <CatalogueBreadcrumb
        crumbs={[
          { label: 'Home', href: '/student/catalogue' },
          { label: `Year ${year}`, href: `/student/catalogue/${year}` },
          { label: `Module ${moduleCode}` },
        ]}
      />

      {error && (
        <div role="alert" style={{ padding: '12px 16px', color: 'var(--error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: 40 }}>
          <SpinnerIcon size={16} className="animate-spin" />
          Loading subjects…
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
              borderRadius: 20,
              padding: '24px 26px',
              background: 'var(--surface)',
              border: '1px solid var(--line2)',
              marginBottom: 30,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: 'ui-monospace,Menlo,monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--accent-text)',
                  background: 'var(--line2)',
                  border: '1px solid var(--line2)',
                  padding: '5px 10px',
                  borderRadius: 7,
                }}
              >
                MODULE {data.moduleCode}
              </span>
              <h1 style={{ margin: '14px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                {data.moduleName}
              </h1>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 8 }}>
                {data.subjects.length} subjects · {data.chapterTotal} chapters · {data.publishedTotal} published
                question{data.publishedTotal === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--text3)', letterSpacing: '-0.02em' }}>—</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Module progress</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              Subjects in this module
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>A subject can also appear in other modules</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {data.subjects.map((s) => (
              <Link
                key={s.slug}
                href={`/student/catalogue/${year}/${moduleCode}/${s.slug}`}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 16,
                  padding: 20,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 120,
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid var(--line)',
                    marginBottom: 14,
                    position: 'relative',
                    background: 'var(--fill)',
                  }}
                >
                  {getSubjectImage(s.slug) ? (
                    <Image src={getSubjectImage(s.slug)!} alt="" fill sizes="360px" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        fontWeight: 800,
                        color: 'var(--accent-text)',
                      }}
                    >
                      {initialsOf(s.name)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
                  {s.chapterCount} chapters in this module
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{s.publishedCount}</span>
                  <span>published question{s.publishedCount === 1 ? '' : 's'}</span>
                </div>
                <div
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#F7F9FA',
                    background: 'var(--accent-text)',
                    padding: 10,
                    borderRadius: 10,
                  }}
                >
                  View Chapters →
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </CatalogueShell>
  );
}
