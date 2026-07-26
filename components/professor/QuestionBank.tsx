'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchQuestions,
  patchQuestion,
  type ModuleWithChapters,
  type ProfessorQuestion,
} from '@/lib/professor-api';

type Props = {
  modules: ModuleWithChapters[];
  onChanged: () => void | Promise<void>;
};

type StatusFilter = 'all' | 'draft' | 'under_review' | 'published' | 'archived';

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 20,
};

const STATUS_STYLES: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  draft: { bg: 'rgba(148,163,184,0.14)', color: '#94A3B8', label: 'Draft' },
  under_review: { bg: 'rgba(14,165,233,0.14)', color: '#0EA5E9', label: 'Under Review' },
  published: { bg: 'rgba(16,185,129,0.14)', color: '#10B981', label: 'Published' },
  archived: { bg: 'rgba(239,68,68,0.14)', color: '#EF4444', label: 'Archived' },
};

export function QuestionBank({ modules, onChanged }: Props) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [moduleCode, setModuleCode] = useState<string>('all');
  const [chapterId, setChapterId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [questions, setQuestions] = useState<ProfessorQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rowUpdating, setRowUpdating] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const currentModule = modules.find((m) => m.code === moduleCode) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof fetchQuestions>[0] = {
        limit: 100,
      };
      if (status !== 'all') params.status = status;
      if (chapterId !== 'all') params.chapterId = chapterId;
      if (moduleCode !== 'all' && chapterId === 'all') params.moduleCode = moduleCode;
      const { questions: rows, total: t } = await fetchQuestions(params);
      setQuestions(rows);
      setTotal(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status, moduleCode, chapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter((q) => q.question.toLowerCase().includes(term));
  }, [questions, search]);

  const setRowStatus = useCallback(
    async (q: ProfessorQuestion, next: 'published' | 'draft' | 'archived') => {
      setRowUpdating((prev) => ({ ...prev, [q.id]: true }));
      try {
        await patchQuestion(q.id, { status: next });
        setQuestions((prev) =>
          prev.map((row) => (row.id === q.id ? { ...row, status: next } : row))
        );
        await onChanged();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setRowUpdating((prev) => {
          const c = { ...prev };
          delete c[q.id];
          return c;
        });
      }
    },
    [onChanged]
  );

  const stats = useMemo(() => {
    return {
      draft: questions.filter((q) => q.status === 'draft').length,
      under_review: questions.filter((q) => q.status === 'under_review').length,
      published: questions.filter((q) => q.status === 'published').length,
      archived: questions.filter((q) => q.status === 'archived').length,
    };
  }, [questions]);

  const modulesLookup = useMemo(() => {
    const m = new Map<string, string>();
    modules.forEach((mod) =>
      mod.chapters.forEach((c) => m.set(c.id, `HIST ${mod.code} · ${c.name}`))
    );
    return m;
  }, [modules]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filter row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 220px 240px 240px',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          placeholder="Search question text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            height: 40,
            padding: '0 14px',
            borderRadius: 10,
            background: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F8FAFC',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          style={{
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            background: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F8FAFC',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={moduleCode}
          onChange={(e) => {
            setModuleCode(e.target.value);
            setChapterId('all');
          }}
          style={{
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            background: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F8FAFC',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m.code} value={m.code}>
              HIST {m.code} · {m.name}
            </option>
          ))}
        </select>
        <select
          value={chapterId}
          onChange={(e) => setChapterId(e.target.value)}
          disabled={moduleCode === 'all'}
          style={{
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            background: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.08)',
            color: moduleCode === 'all' ? '#64748B' : '#F8FAFC',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          <option value="all">All chapters</option>
          {(currentModule?.chapters ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {(['draft', 'under_review', 'published', 'archived'] as const).map((k) => {
          const st = STATUS_STYLES[k];
          return (
            <div key={k} style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{st.label}</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  marginTop: 6,
                  color: st.color,
                  letterSpacing: '-0.02em',
                }}
              >
                {stats[k]}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            fontSize: 12.5,
            color: '#FCA5A5',
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {filtered.length} question{filtered.length === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {total} total matching this filter
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
            No questions match the current filter.
          </div>
        ) : (
          <div>
            {filtered.map((q) => {
              const isExpanded = expanded === q.id;
              const st = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft;
              const updating = !!rowUpdating[q.id];
              return (
                <div
                  key={q.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 22px',
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr 200px 140px 220px',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>
                      #{q.id}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : q.id)}
                      style={{
                        fontSize: 13,
                        color: '#F8FAFC',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {q.question}
                    </button>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      {q.chapter_id ? modulesLookup.get(q.chapter_id) ?? '—' : '—'}
                    </div>
                    <span
                      style={{
                        justifySelf: 'start',
                        fontSize: 11,
                        fontWeight: 700,
                        color: st.color,
                        background: st.bg,
                        padding: '5px 10px',
                        borderRadius: 8,
                      }}
                    >
                      {st.label}
                    </span>
                    <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
                      {q.status !== 'published' && (
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => setRowStatus(q, 'published')}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#10B981',
                            border: '1px solid rgba(16,185,129,0.4)',
                            background: 'transparent',
                            padding: '6px 10px',
                            borderRadius: 8,
                            cursor: updating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Publish
                        </button>
                      )}
                      {q.status === 'published' && (
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => setRowStatus(q, 'draft')}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#94A3B8',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: 'transparent',
                            padding: '6px 10px',
                            borderRadius: 8,
                            cursor: updating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Unpublish
                        </button>
                      )}
                      {q.status !== 'archived' && (
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => {
                            if (confirm('Archive this question? It will be hidden from students.')) {
                              void setRowStatus(q, 'archived');
                            }
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#EF4444',
                            border: '1px solid rgba(239,68,68,0.35)',
                            background: 'transparent',
                            padding: '6px 10px',
                            borderRadius: 8,
                            cursor: updating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '4px 22px 20px 82px' }}>
                      <div
                        style={{
                          padding: 16,
                          borderRadius: 10,
                          background: '#0F0F1A',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {q.choices.map((c) => {
                            const isCorrect = c.id === q.correct_answer;
                            return (
                              <div
                                key={c.id}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  fontSize: 12.5,
                                  color: isCorrect ? '#10B981' : '#CBD5E1',
                                  fontWeight: isCorrect ? 600 : 400,
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: '#64748B',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {c.id}.
                                </span>
                                <span>{c.text}</span>
                                {isCorrect && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: '#10B981',
                                      marginLeft: 'auto',
                                    }}
                                  >
                                    ✓ correct
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {q.explanation && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                              Explanation
                            </div>
                            <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5 }}>
                              {q.explanation}
                            </div>
                          </div>
                        )}
                        {q.reference && (
                          <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8' }}>
                            Reference: {q.reference}
                          </div>
                        )}
                        {q.flag_count > 0 && (
                          <div
                            style={{
                              marginTop: 12,
                              fontSize: 11,
                              color: '#EF4444',
                            }}
                          >
                            ⚑ Flagged by {q.flag_count} student{q.flag_count === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
