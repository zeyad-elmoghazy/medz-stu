'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminQuestions,
  patchAdminQuestion,
  fetchAdminModules,
  fetchModuleSubjects,
  fetchAdminChapters,
  createAdminChapter,
  moveAdminQuestions,
  type AdminQuestion,
  type AdminModule,
  type ModuleSubject,
  type AdminChapter,
} from '@/lib/admin-content-api';

type Props = {
  onChanged: () => void | Promise<void>;
};

type StatusFilter = 'all' | 'draft' | 'under_review' | 'published' | 'archived';

const CARD: React.CSSProperties = {
  background: '#132B45',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 20,
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(148,163,184,0.14)', color: '#94A3B8', label: 'Draft' },
  under_review: { bg: 'rgba(14,165,233,0.14)', color: '#0EA5E9', label: 'Under Review' },
  published: { bg: 'rgba(16,185,129,0.14)', color: '#10B981', label: 'Published' },
  archived: { bg: 'rgba(239,68,68,0.14)', color: '#EF4444', label: 'Archived' },
};

export function AdminQuestionReview({ onChanged }: Props) {
  const [status, setStatus] = useState<StatusFilter>('under_review');
  const [moduleCode, setModuleCode] = useState<string>('all');
  const [subjectId, setSubjectId] = useState<string>('');
  const [chapterId, setChapterId] = useState<string>('');
  const [subjects, setSubjects] = useState<ModuleSubject[]>([]);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [search, setSearch] = useState('');
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rowUpdating, setRowUpdating] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Split mode (one chapter picked): tick questions and move them to
  // another chapter, e.g. a new "Part 2" created right after this one.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [fromPosition, setFromPosition] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [moving, setMoving] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [creatingPart, setCreatingPart] = useState(false);

  const splitMode = chapterId !== '';
  const currentChapter = chapters.find((c) => c.id === chapterId) ?? null;

  useEffect(() => {
    fetchAdminModules().then(({ modules: m }) => setModules(m));
  }, []);

  useEffect(() => {
    if (moduleCode === 'all') return;
    let cancelled = false;
    fetchModuleSubjects(moduleCode)
      .then(({ subjects: s }) => {
        if (!cancelled) setSubjects(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [moduleCode]);

  const loadChapters = useCallback(async () => {
    if (moduleCode === 'all' || !subjectId) return;
    const { chapters: c } = await fetchAdminChapters(moduleCode, subjectId);
    setChapters(c);
  }, [moduleCode, subjectId]);

  useEffect(() => {
    // Same pattern as load() below: a fetch that sets state when it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChapters().catch(() => {});
  }, [loadChapters]);

  // Resets happen in the handlers, not in effects (react-hooks/set-state-in-effect).
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, []);
  const onModuleChange = (code: string) => {
    setModuleCode(code);
    setSubjectId('');
    setChapterId('');
    setSubjects([]);
    setChapters([]);
    clearSelection();
  };
  const onSubjectChange = (id: string) => {
    setSubjectId(id);
    setChapterId('');
    setChapters([]);
    clearSelection();
  };
  const onChapterChange = (id: string) => {
    setChapterId(id);
    setMoveTarget('');
    // Splitting moves every question in the chapter, whatever its status.
    if (id) setStatus('all');
    clearSelection();
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof fetchAdminQuestions>[0] = chapterId
        ? { chapterId, order: 'position', limit: 500 }
        : { limit: 100 };
      if (status !== 'all') params.status = status;
      if (!chapterId) {
        if (moduleCode !== 'all') params.moduleCode = moduleCode;
        if (subjectId) params.subjectId = subjectId;
      }
      const { questions: rows, total: t } = await fetchAdminQuestions(params);
      setQuestions(rows);
      setTotal(t);
      setSelected(new Set());
      setLastClicked(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status, moduleCode, subjectId, chapterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter((q) => q.question.toLowerCase().includes(term));
  }, [questions, search]);

  // Position = the order students get the chapter's questions in (id asc).
  const positionById = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions]);

  const toggleRow = useCallback(
    (id: number, withRange: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (withRange && lastClicked !== null) {
          const ids = filtered.map((q) => q.id);
          const a = ids.indexOf(lastClicked);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (const rowId of ids.slice(lo, hi + 1)) next.add(rowId);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClicked(id);
    },
    [filtered, lastClicked]
  );

  const selectFromPosition = useCallback(() => {
    const from = Number(fromPosition);
    if (!Number.isInteger(from) || from < 1) return;
    setSelected(new Set(questions.filter((q) => (positionById.get(q.id) ?? 0) >= from).map((q) => q.id)));
  }, [fromPosition, questions, positionById]);

  const handleCreatePart = useCallback(async () => {
    if (!currentChapter) return;
    const name = (newPartName.trim() || `${currentChapter.name} (Part 2)`).slice(0, 200);
    setCreatingPart(true);
    try {
      const { chapter } = await createAdminChapter({
        moduleCode: currentChapter.module_code,
        subjectId: currentChapter.subject_id,
        name,
        afterChapterId: currentChapter.id,
      });
      await loadChapters();
      setMoveTarget(chapter.id);
      setNewPartName('');
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create the chapter');
    } finally {
      setCreatingPart(false);
    }
  }, [currentChapter, newPartName, loadChapters, onChanged]);

  const handleMove = useCallback(async () => {
    const target = chapters.find((c) => c.id === moveTarget);
    if (!target || !currentChapter || selected.size === 0) return;
    const n = selected.size;
    const ok = confirm(
      `Move ${n} question${n === 1 ? '' : 's'} from "${currentChapter.name}" to "${target.name}"?\n\n` +
        `Students' past attempts stay recorded on "${currentChapter.name}".`
    );
    if (!ok) return;
    setMoving(true);
    try {
      await moveAdminQuestions([...selected], target.id);
      await Promise.all([load(), loadChapters()]);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setMoving(false);
    }
  }, [chapters, moveTarget, currentChapter, selected, load, loadChapters, onChanged]);

  const setRowStatus = useCallback(
    async (q: AdminQuestion, next: 'published' | 'draft' | 'archived') => {
      setRowUpdating((prev) => ({ ...prev, [q.id]: true }));
      try {
        await patchAdminQuestion(q.id, { status: next });
        setQuestions((prev) => prev.map((row) => (row.id === q.id ? { ...row, status: next } : row)));
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

  const stats = useMemo(
    () => ({
      draft: questions.filter((q) => q.status === 'draft').length,
      under_review: questions.filter((q) => q.status === 'under_review').length,
      published: questions.filter((q) => q.status === 'published').length,
      archived: questions.filter((q) => q.status === 'archived').length,
    }),
    [questions]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filter row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search question text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={filterInput}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} style={filterInput} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select value={moduleCode} onChange={(e) => onModuleChange(e.target.value)} style={filterInput} aria-label="Module">
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m.code} value={m.code}>
              {m.code} · {m.name}
            </option>
          ))}
        </select>
        <select
          value={subjectId}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={moduleCode === 'all'}
          style={{ ...filterInput, opacity: moduleCode === 'all' ? 0.5 : 1 }}
          aria-label="Subject"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={chapterId}
          onChange={(e) => onChapterChange(e.target.value)}
          disabled={!subjectId}
          style={{ ...filterInput, opacity: !subjectId ? 0.5 : 1 }}
          aria-label="Chapter"
        >
          <option value="">All chapters</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ordinal}. {c.name} ({c.question_count})
            </option>
          ))}
        </select>
      </div>

      {splitMode && currentChapter && (
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'rgba(0,166,166,0.35)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Split chapter {currentChapter.ordinal}: {currentChapter.name}
            </div>
            <div style={{ fontSize: 11.5, color: '#8B98A6', lineHeight: 1.55, marginTop: 6, maxWidth: 760 }}>
              Questions are numbered in the order students get them. 1) Create the next part. 2) Tick the questions that belong
              in it (shift-click ticks a range). 3) Move them. A new part is placed right after this chapter and copies its
              topic and reference book.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={splitLabel}>1</span>
            <input
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
              placeholder={`${currentChapter.name} (Part 2)`}
              aria-label="New chapter name"
              style={{ ...filterInput, flex: 1, minWidth: 240 }}
            />
            <button type="button" onClick={handleCreatePart} disabled={creatingPart} style={actionBtn(creatingPart)}>
              {creatingPart ? 'Creating…' : '+ New chapter after this one'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={splitLabel}>2</span>
            <span style={{ fontSize: 12, color: '#8B98A6' }}>Tick from #</span>
            <input
              type="number"
              min={1}
              max={questions.length || undefined}
              value={fromPosition}
              onChange={(e) => setFromPosition(e.target.value)}
              aria-label="Tick from position"
              style={{ ...filterInput, width: 84 }}
            />
            <button type="button" onClick={selectFromPosition} disabled={!fromPosition} style={actionBtn(!fromPosition, true)}>
              to the end
            </button>
            <button type="button" onClick={() => setSelected(new Set(filtered.map((q) => q.id)))} style={actionBtn(false, true)}>
              Tick all shown
            </button>
            <button type="button" onClick={clearSelection} disabled={selected.size === 0} style={actionBtn(selected.size === 0, true)}>
              Clear
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: selected.size ? '#33BFBF' : '#8B98A6' }} aria-live="polite">
              {selected.size} ticked
            </span>
          </div>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={splitLabel}>3</span>
            <span style={{ fontSize: 12, color: '#8B98A6' }}>Move ticked questions to</span>
            <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} aria-label="Move to chapter" style={{ ...filterInput, minWidth: 280, flex: 1 }}>
              <option value="">Choose a chapter…</option>
              {chapters
                .filter((c) => c.id !== chapterId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ordinal}. {c.name} ({c.question_count})
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={handleMove}
              disabled={moving || selected.size === 0 || !moveTarget}
              style={actionBtn(moving || selected.size === 0 || !moveTarget)}
            >
              {moving ? 'Moving…' : `Move ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      )}

      {/* Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {(['draft', 'under_review', 'published', 'archived'] as const).map((k) => {
          const st = STATUS_STYLES[k];
          return (
            <div key={k} style={{ ...CARD, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#8B98A6', fontWeight: 500 }}>{st.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: st.color, letterSpacing: '-0.02em' }}>{stats[k]}</div>
            </div>
          );
        })}
      </div>

      {error && <div role="alert" style={errorBox}>{error}</div>}

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{filtered.length} question{filtered.length === 1 ? '' : 's'}</div>
          <div style={{ fontSize: 11, color: '#8B98A6' }}>{total} total matching this filter</div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8B98A6', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8B98A6', fontSize: 13 }}>No questions match the current filter.</div>
        ) : (
          <div>
            {filtered.map((q) => {
              const isExpanded = expanded === q.id;
              const st = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft;
              const updating = !!rowUpdating[q.id];
              const location = q.chapters ? `${q.chapters.module_code} · ${q.chapters.name}` : '—';
              const isTicked = selected.has(q.id);
              const pos = positionById.get(q.id) ?? 0;
              return (
                <div key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isTicked ? 'rgba(0,166,166,0.08)' : undefined }}>
                  <div
                    style={{
                      padding: '14px 22px',
                      display: 'grid',
                      // Split mode lists one chapter, so the location column is dropped.
                      gridTemplateColumns: splitMode ? '20px 56px 1fr 120px auto' : '48px 1fr 200px 140px 220px',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    {splitMode && (
                      <input
                        type="checkbox"
                        checked={isTicked}
                        onChange={() => {}}
                        onClick={(e) => toggleRow(q.id, e.shiftKey)}
                        aria-label={`Tick question ${pos}`}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#00A6A6' }}
                      />
                    )}
                    {splitMode ? (
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#F7F9FA', fontFamily: "'JetBrains Mono', monospace" }}>
                        #{pos}
                        <span style={{ display: 'block', fontSize: 9.5, fontWeight: 400, color: '#8B98A6' }}>id {q.id}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#8B98A6', fontFamily: "'JetBrains Mono', monospace" }}>#{q.id}</div>
                    )}
                    <button type="button" onClick={() => setExpanded(isExpanded ? null : q.id)} style={questionCell}>
                      {q.question}
                    </button>
                    {!splitMode && <div style={{ fontSize: 11, color: '#8B98A6' }}>{location}</div>}
                    <span style={{ justifySelf: 'start', fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: '5px 10px', borderRadius: 8 }}>
                      {st.label}
                    </span>
                    <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
                      {q.status !== 'published' && (
                        <RowActionButton color="#10B981" border="rgba(16,185,129,0.4)" disabled={updating} onClick={() => setRowStatus(q, 'published')}>Publish</RowActionButton>
                      )}
                      {q.status === 'published' && (
                        <RowActionButton color="#8B98A6" border="rgba(255,255,255,0.14)" disabled={updating} onClick={() => setRowStatus(q, 'draft')}>Unpublish</RowActionButton>
                      )}
                      {q.status !== 'archived' && (
                        <RowActionButton
                          color="#EF4444"
                          border="rgba(239,68,68,0.35)"
                          disabled={updating}
                          onClick={() => {
                            if (confirm('Archive this question? It will be hidden from students.')) void setRowStatus(q, 'archived');
                          }}
                        >
                          Archive
                        </RowActionButton>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '4px 22px 20px 82px' }}>
                      <div style={{ padding: 16, borderRadius: 10, background: '#132B45', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {q.choices.map((c) => {
                            const isCorrect = c.id === q.correct_answer;
                            return (
                              <div key={c.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: isCorrect ? '#10B981' : '#8B98A6', fontWeight: isCorrect ? 600 : 400 }}>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#8B98A6', textTransform: 'uppercase' }}>{c.id}.</span>
                                <span>{c.text}</span>
                                {isCorrect && <span style={{ fontSize: 10, color: '#10B981', marginLeft: 'auto' }}>✓ correct</span>}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 10, color: '#8B98A6', marginBottom: 4 }}>Explanation</div>
                            <div style={{ fontSize: 12, color: '#8B98A6', lineHeight: 1.5 }}>{q.explanation}</div>
                          </div>
                        )}

                        {/* ==== The actual "review before publish" surface: the
                            resolved reference-book page image, not just a page
                            number. This is what step 6's referenceImageUrl
                            resolver was built for. ==== */}
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 10, color: '#8B98A6', marginBottom: 6 }}>
                            Reference{q.reference_page ? ` — page ${q.reference_page}` : ''}
                          </div>
                          {q.reference && (
                            <div style={{ fontSize: 11, color: '#8B98A6', marginBottom: 8 }}>{q.reference}</div>
                          )}
                          {q.referenceImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={q.referenceImageUrl}
                              alt={`Reference page ${q.reference_page ?? ''}`}
                              style={{
                                display: 'block',
                                maxWidth: 420,
                                width: '100%',
                                height: 'auto',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}
                            />
                          ) : q.reference_page ? (
                            <div style={{ fontSize: 11, color: '#F97316' }}>
                              Page {q.reference_page} cited, but no reference image resolved — check
                              the module has a book assigned and that book has this page digitized.
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#8B98A6' }}>No page reference set.</div>
                          )}
                        </div>

                        {q.flag_count > 0 && (
                          <div style={{ marginTop: 12, fontSize: 11, color: '#EF4444' }}>
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

function RowActionButton({
  color,
  border,
  disabled,
  onClick,
  children,
}: {
  color: string;
  border: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${border}`,
        background: 'transparent',
        padding: '6px 10px',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

const filterInput: React.CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  background: '#132B45',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#F7F9FA',
  fontSize: 13,
  fontFamily: 'inherit',
};

const questionCell: React.CSSProperties = {
  fontSize: 13,
  color: '#F7F9FA',
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
};

const splitLabel: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 11,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 800,
  color: '#0B1C2E',
  background: '#33BFBF',
  flex: 'none',
};

function actionBtn(disabled: boolean, ghost = false): React.CSSProperties {
  return {
    height: 40,
    padding: '0 14px',
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    color: ghost ? '#33BFBF' : '#0B1C2E',
    background: ghost ? 'transparent' : '#00A6A6',
    border: ghost ? '1px solid rgba(0,166,166,0.45)' : '1px solid #00A6A6',
    whiteSpace: 'nowrap',
  };
}

const errorBox: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 10,
  fontSize: 12.5,
  color: '#FCA5A5',
};
