'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchChaptersBySubject, type ChaptersBySubject } from '@/lib/catalogue-api';

export default function CatalogueChaptersPage() {
  const params = useParams<{ year: string; moduleCode: string; subjectSlug: string }>();
  const { year, moduleCode, subjectSlug } = params;

  const [data, setData] = useState<ChaptersBySubject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;
    fetchChaptersBySubject(moduleCode, subjectSlug)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [moduleCode, subjectSlug]);

  useEffect(() => {
    setTopicFilter('All');
  }, [moduleCode, subjectSlug]);

  const hasTopics = useMemo(() => !!data && data.chapters.some((c) => !!c.topic), [data]);

  const topics = useMemo(() => {
    if (!data || !hasTopics) return [];
    const seen: string[] = [];
    data.chapters.forEach((c) => {
      const t = c.topic || 'Other';
      if (!seen.includes(t)) seen.push(t);
    });
    return seen;
  }, [data, hasTopics]);

  const topicChips = useMemo(
    () => (hasTopics ? ['All', ...topics] : []),
    [hasTopics, topics]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.chapters.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (hasTopics && topicFilter !== 'All' && (c.topic || 'Other') !== topicFilter) return false;
      return true;
    });
  }, [data, search, hasTopics, topicFilter]);

  const chapterGroups = useMemo(() => {
    if (!hasTopics) return [{ topicLabel: '', hasLabel: false, rows: filtered }];
    const groupsMap: Record<string, typeof filtered> = {};
    filtered.forEach((c) => {
      const t = c.topic || 'Other';
      if (!groupsMap[t]) groupsMap[t] = [];
      groupsMap[t].push(c);
    });
    return Object.keys(groupsMap).map((t) => ({ topicLabel: t, hasLabel: true, rows: groupsMap[t] }));
  }, [filtered, hasTopics]);

  return (
    <CatalogueShell>
      <CatalogueBreadcrumb
        crumbs={[
          { label: 'Home', href: '/student/catalogue' },
          { label: `Year ${year}`, href: `/student/catalogue/${year}` },
          { label: `Module ${moduleCode}`, href: `/student/catalogue/${year}/${moduleCode}` },
          { label: data?.subjectName ?? '' },
        ]}
      />

      {error && (
        <div role="alert" style={{ padding: '12px 16px', color: '#FCA5A5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8B98A6', fontSize: 13, padding: 40 }}>
          <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
          Loading chapters…
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
              padding: '22px 26px',
              background: 'linear-gradient(135deg,#132B45,#0B1F33)',
              border: '1px solid rgba(0,166,166,0.4)',
              boxShadow: '0 0 40px rgba(0,166,166,0.14)',
              marginBottom: 26,
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
                  color: '#33BFBF',
                  background: 'rgba(0,166,166,0.16)',
                  border: '1px solid rgba(0,166,166,0.35)',
                  padding: '5px 10px',
                  borderRadius: 7,
                }}
              >
                MODULE {data.moduleCode}
              </span>
              <h1 style={{ margin: '14px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: '#F7F9FA' }}>
                {data.subjectName}
              </h1>
              <div style={{ fontSize: 12.5, color: '#8B98A6', marginTop: 8 }}>
                {data.chapterTotal} chapters · {data.publishedTotal} published question
                {data.publishedTotal === 1 ? '' : 's'}
              </div>
            </div>
            {data.publishedTotal === 0 && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#8B98A6',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '6px 11px',
                  borderRadius: 7,
                  flex: 'none',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8B98A6" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" />
                </svg>
                Awaiting content
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
              <Search
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#8B98A6' }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chapters…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  color: '#F7F9FA',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 9,
                  padding: '9px 12px 9px 34px',
                  outline: 'none',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#8B98A6' }}>
              {filtered.length} of {data.chapterTotal}
            </span>
          </div>

          {hasTopics && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
              {topicChips.map((t) => {
                const active = topicFilter === t;
                return (
                  <span
                    key={t}
                    onClick={() => setTopicFilter(t)}
                    style={
                      active
                        ? {
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#F7F9FA',
                            background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                            padding: '7px 14px',
                            borderRadius: 8,
                          }
                        : {
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#8B98A6',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.09)',
                            padding: '7px 14px',
                            borderRadius: 8,
                          }
                    }
                  >
                    {t}
                  </span>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div
              style={{
                marginTop: 20,
                padding: 36,
                textAlign: 'center',
                fontSize: 13,
                color: '#8B98A6',
                border: '1px dashed rgba(255,255,255,0.09)',
                borderRadius: 16,
              }}
            >
              No chapters match &quot;{search}&quot;.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              {chapterGroups.map((g) => (
                <div key={g.topicLabel || '__ungrouped'}>
                  {g.hasLabel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#8B98A6',
                        }}
                      >
                        {g.topicLabel}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.rows.map((c) => {
                      const published = c.publishedCount > 0;
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: '14px 18px',
                            borderRadius: 13,
                            background: '#132B45',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              flex: 'none',
                              borderRadius: 9,
                              background: 'rgba(0,166,166,0.12)',
                              border: '1px solid rgba(0,166,166,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'ui-monospace,Menlo,monospace',
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#33BFBF',
                            }}
                          >
                            {String(c.ordinal).padStart(2, '0')}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14,
                              fontWeight: 600,
                              letterSpacing: '-0.005em',
                              color: '#F7F9FA',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.name}
                          </div>
                          <span
                            style={{
                              flex: 'none',
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              padding: '5px 10px',
                              borderRadius: 7,
                              color: published ? '#33BFBF' : '#8B98A6',
                              background: published ? 'rgba(0,166,166,0.14)' : 'rgba(255,255,255,0.05)',
                              border: published ? '1px solid rgba(0,166,166,0.4)' : '1px solid rgba(255,255,255,0.09)',
                            }}
                          >
                            {published
                              ? `${c.publishedCount} published question${c.publishedCount === 1 ? '' : 's'}`
                              : '0 questions'}
                          </span>
                          {published && (
                            <Link
                              href={`/student/quiz/chapter/${c.id}`}
                              style={{
                                flex: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                padding: '7px 12px',
                                borderRadius: 7,
                                color: '#F7F9FA',
                                background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                                textDecoration: 'none',
                              }}
                            >
                              Start Quiz
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </CatalogueShell>
  );
}
