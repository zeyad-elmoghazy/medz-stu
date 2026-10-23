'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SearchIcon, SpinnerIcon } from '@/components/icons';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchChaptersBySubject, type ChaptersBySubject } from '@/lib/catalogue-api';
import { useChapterQuizStore } from '@/lib/chapter-quiz-store';
import { deleteChapterProgress } from '@/lib/chapter-quiz-api';
import { LinkPending } from '@/components/ui/LinkPending';

export default function CatalogueChaptersPage() {
  const params = useParams<{ year: string; moduleCode: string; subjectSlug: string }>();
  const { year, moduleCode } = params;
  // useParams() returns dynamic segments raw (still percent-encoded), unlike
  // the decoded `params` prop Next.js passes to server pages. Slugs with a
  // reserved character (e.g. "microbiology-&-immunology") arrive here as
  // "microbiology-%26-immunology" and, left undecoded, get double-encoded
  // by fetchChaptersBySubject's URLSearchParams.set() — which the API then
  // only decodes once, so it never matches a real subject slug.
  const subjectSlug = decodeURIComponent(params.subjectSlug);

  const [data, setData] = useState<ChaptersBySubject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('All');
  const [restartingId, setRestartingId] = useState<string | null>(null);

  // "Start over": discard the saved attempt for one chapter, then show
  // the card as it would look with no attempt in progress.
  async function handleStartOver(chapterId: string) {
    if (restartingId) return;
    if (
      !window.confirm(
        'Start this chapter over? Your saved answers for this attempt will be discarded.'
      )
    ) {
      return;
    }
    setRestartingId(chapterId);
    const ok = await deleteChapterProgress(chapterId);
    setRestartingId(null);
    if (!ok) {
      window.alert("Couldn't discard your saved progress. Check your connection and try again.");
      return;
    }
    setData((d) =>
      d
        ? {
            ...d,
            chapters: d.chapters.map((ch) =>
              ch.id === chapterId ? { ...ch, inProgress: null } : ch
            ),
          }
        : d
    );
  }

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
    (() => {
      setTopicFilter('All');
    })();
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
        <div role="alert" style={{ padding: '12px 16px', color: 'var(--error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: 40 }}>
          <SpinnerIcon size={16} className="animate-spin" />
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
              background: 'var(--surface)',
              border: '1px solid var(--line2)',
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
                {data.subjectName}
              </h1>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 8 }}>
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
                  color: 'var(--text3)',
                  background: 'var(--fill)',
                  border: '1px solid var(--line2)',
                  padding: '6px 11px',
                  borderRadius: 7,
                  flex: 'none',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" />
                </svg>
                Awaiting content
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
              <SearchIcon
                size={14}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chapters…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  color: 'var(--text)',
                  background: 'var(--fill)',
                  border: '1px solid var(--line2)',
                  borderRadius: 9,
                  padding: '9px 12px 9px 34px',
                  outline: 'none',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
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
                    className="mz-chip"
                    onClick={() => setTopicFilter(t)}
                    style={
                      active
                        ? {
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#F7F9FA',
                            background: 'var(--accent-text)',
                            padding: '7px 14px',
                            borderRadius: 8,
                          }
                        : {
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text3)',
                            background: 'var(--fill)',
                            border: '1px solid var(--line)',
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
                color: 'var(--text3)',
                border: '1px dashed var(--line)',
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
                          color: 'var(--text3)',
                        }}
                      >
                        {g.topicLabel}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.rows.map((c) => {
                      const published = c.publishedCount > 0;
                      return (
                        <div
                          key={c.id}
                          className="mz-chrow"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: '14px 18px',
                            borderRadius: 13,
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              flex: 'none',
                              borderRadius: 9,
                              background: 'var(--line2)',
                              border: '1px solid var(--line2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'ui-monospace,Menlo,monospace',
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--accent-text)',
                            }}
                          >
                            {String(c.ordinal).padStart(2, '0')}
                          </div>
                          <div
                            className="mz-chname"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14,
                              fontWeight: 600,
                              letterSpacing: '-0.005em',
                              color: 'var(--text)',
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
                              color: published ? 'var(--accent-text)' : 'var(--text3)',
                              background: published ? 'var(--line2)' : 'var(--fill)',
                              border: published ? '1px solid var(--line2)' : '1px solid var(--line)',
                            }}
                          >
                            {published
                              ? `${c.publishedCount} published question${c.publishedCount === 1 ? '' : 's'}`
                              : '0 questions'}
                          </span>
                          {published && c.inProgress && (
                            <>
                              <span
                                style={{
                                  flex: 'none',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  color: 'var(--text2)',
                                }}
                              >
                                {c.inProgress.answered} / {c.inProgress.total} answered
                              </span>
                              {/* No startSession() here: Continue must resume the
                                  saved attempt, not reset it. */}
                              <Link
                                href={`/student/quiz/chapter/${c.id}`}
                                className="mz-chact"
                                style={{
                                  flex: 'none',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  padding: '7px 12px',
                                  borderRadius: 7,
                                  color: '#F7F9FA',
                                  background: 'var(--accent-text)',
                                  textDecoration: 'none',
                                }}
                              >
                                Continue
                                <LinkPending />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleStartOver(c.id)}
                                disabled={restartingId === c.id}
                                className="mz-chact"
                                style={{
                                  flex: 'none',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  padding: '7px 12px',
                                  borderRadius: 7,
                                  color: 'var(--text2)',
                                  background: 'var(--fill)',
                                  border: '1px solid var(--line)',
                                  cursor: restartingId === c.id ? 'default' : 'pointer',
                                  opacity: restartingId === c.id ? 0.6 : 1,
                                }}
                              >
                                {restartingId === c.id ? 'Resetting…' : 'Start over'}
                              </button>
                            </>
                          )}
                          {published && !c.inProgress && !c.attempted && (
                            <Link
                              href={`/student/quiz/chapter/${c.id}`}
                              onClick={() => useChapterQuizStore.getState().startSession()}
                              className="mz-chact"
                              style={{
                                flex: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                padding: '7px 12px',
                                borderRadius: 7,
                                color: '#F7F9FA',
                                background: 'var(--accent-text)',
                                textDecoration: 'none',
                              }}
                            >
                              Start Quiz
                              <LinkPending />
                            </Link>
                          )}
                          {published && !c.inProgress && c.attempted && (
                            <>
                              <Link
                                href={`/student/quiz/chapter/${c.id}`}
                                onClick={() => useChapterQuizStore.getState().startSession()}
                                className="mz-chact"
                                style={{
                                  flex: 'none',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  padding: '7px 12px',
                                  borderRadius: 7,
                                  color: '#F7F9FA',
                                  background: 'var(--accent-text)',
                                  textDecoration: 'none',
                                }}
                              >
                                Solve Again
                                <LinkPending />
                              </Link>
                              {c.mistakeQuestionIds.length > 0 && (
                                <Link
                                  href={`/student/quiz/chapter/${c.id}`}
                                  onClick={() =>
                                    useChapterQuizStore
                                      .getState()
                                      .startMistakeSession(c.id, c.mistakeQuestionIds)
                                  }
                                  className="mz-chact"
                                  style={{
                                    flex: 'none',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    padding: '7px 12px',
                                    borderRadius: 7,
                                    color: '#F7F9FA',
                                    background: 'var(--accent-text)',
                                    textDecoration: 'none',
                                  }}
                                >
                                  Practice mistakes ({c.mistakeQuestionIds.length})
                                  <LinkPending />
                                </Link>
                              )}
                            </>
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
