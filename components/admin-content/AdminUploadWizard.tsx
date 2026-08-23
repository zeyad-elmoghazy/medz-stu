'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminModules,
  fetchModuleSubjects,
  fetchAdminChapters,
  createAdminChapter,
  createAdminQuestion,
  uploadPdfForExtraction,
  importQuestionsJson,
  type AdminModule,
  type ModuleSubject,
  type AdminChapter,
} from '@/lib/admin-content-api';

type Props = {
  onContentChanged: () => void | Promise<void>;
};

type Step = 1 | 2 | 3;
type Mode = 'manual' | 'pdf' | 'json' | null;

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 24,
};
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#CBD5E1', marginBottom: 8 };
const INPUT: React.CSSProperties = {
  width: '100%',
  background: '#0F0F1A',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 11,
  padding: '13px',
  color: '#F8FAFC',
  fontSize: 13.5,
  lineHeight: 1.5,
  fontFamily: 'inherit',
};
const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e'];

export function AdminUploadWizard({ onContentChanged }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>(null);

  // Destination: module -> subject -> chapter. Chapters are scoped
  // to a (module, subject) pair, not module alone — a module can
  // carry several subjects via module_subjects.
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [moduleCode, setModuleCode] = useState('');
  const [subjects, setSubjects] = useState<ModuleSubject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [destLoading, setDestLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { modules: m } = await fetchAdminModules();
        setModules(m);
        if (m[0]) setModuleCode(m[0].code);
      } finally {
        setDestLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!moduleCode) return;
    setSubjectId('');
    setChapters([]);
    setChapterId('');
    fetchModuleSubjects(moduleCode).then(({ subjects: s }) => {
      setSubjects(s);
      if (s[0]) setSubjectId(s[0].id);
    });
  }, [moduleCode]);

  const loadChapters = useCallback(async () => {
    if (!moduleCode || !subjectId) return;
    const { chapters: c } = await fetchAdminChapters(moduleCode, subjectId);
    setChapters(c);
    setChapterId((prev) => (c.some((ch) => ch.id === prev) ? prev : (c[0]?.id ?? '')));
  }, [moduleCode, subjectId]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  const currentModule = modules.find((m) => m.code === moduleCode) ?? null;
  const currentSubject = subjects.find((s) => s.id === subjectId) ?? null;
  const currentChapter = chapters.find((c) => c.id === chapterId) ?? null;
  const destinationReady = !!moduleCode && !!subjectId && !!chapterId;

  const handleConfirmAddChapter = useCallback(async () => {
    if (!newChapterName.trim() || !moduleCode || !subjectId) return;
    setCreatingChapter(true);
    try {
      const { chapter } = await createAdminChapter({
        moduleCode,
        subjectId,
        name: newChapterName.trim(),
      });
      await loadChapters();
      setChapterId(chapter.id);
      setAddingChapter(false);
      setNewChapterName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add chapter');
    } finally {
      setCreatingChapter(false);
    }
  }, [newChapterName, moduleCode, subjectId, loadChapters]);

  // ---- Manual entry ----
  const [mqStem, setMqStem] = useState('');
  const [mqOptions, setMqOptions] = useState<string[]>(['', '', '']);
  const [mqCorrect, setMqCorrect] = useState(0);
  const [mqExplanation, setMqExplanation] = useState('');
  const [mqReference, setMqReference] = useState('');
  const [mqReferencePage, setMqReferencePage] = useState('');
  const [mqDifficulty, setMqDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [sessionDrafts, setSessionDrafts] = useState<{ id: number; stem: string }[]>([]);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canAddQuestion =
    mqStem.trim().length >= 10 &&
    mqOptions.filter((o) => o.trim()).length >= 2 &&
    !!chapterId &&
    !savingQuestion;

  const resetManual = useCallback(() => {
    setMqStem('');
    setMqOptions(['', '', '']);
    setMqCorrect(0);
    setMqExplanation('');
    setMqReference('');
    setMqReferencePage('');
    setMqDifficulty('medium');
    setSaveError(null);
  }, []);

  const handleAddQuestion = useCallback(async () => {
    if (!canAddQuestion) return;
    setSavingQuestion(true);
    setSaveError(null);
    try {
      const choices = mqOptions
        .map((text, i) => ({ id: OPTION_LETTERS[i], text: text.trim() }))
        .filter((c) => c.text);
      const correctId = OPTION_LETTERS[mqCorrect] ?? 'a';
      const { question } = await createAdminQuestion({
        chapterId,
        question: mqStem.trim(),
        choices,
        correctAnswer: correctId,
        explanation: mqExplanation.trim(),
        reference: mqReference.trim(),
        referencePage: mqReferencePage.trim() ? Number(mqReferencePage.trim()) : undefined,
        difficulty: mqDifficulty,
        status: 'under_review',
      });
      setSessionDrafts((prev) => [{ id: question.id, stem: mqStem.trim().slice(0, 80) }, ...prev]);
      resetManual();
      await onContentChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  }, [canAddQuestion, chapterId, mqOptions, mqCorrect, mqStem, mqExplanation, mqReference, mqReferencePage, mqDifficulty, onContentChanged, resetManual]);

  // ---- PDF (AI extraction) ----
  const [pdfPhase, setPdfPhase] = useState<'idle' | 'processing' | 'done' | 'failed'>('idle');
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [pdfJobId, setPdfJobId] = useState<string | null>(null);
  const [pdfExtracted, setPdfExtracted] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const canStartPdf = !!questionsFile && destinationReady && pdfPhase !== 'processing';

  const handleStartPdf = useCallback(async () => {
    if (!canStartPdf || !questionsFile) return;
    setPdfPhase('processing');
    setPdfError(null);
    setPdfExtracted(0);
    setPdfJobId(null);
    try {
      const form = new FormData();
      form.append('moduleCode', moduleCode);
      form.append('chapterId', chapterId);
      form.append('questions', questionsFile);
      if (notesFile) form.append('notes', notesFile);

      const body = await uploadPdfForExtraction(form);
      setPdfJobId(body.jobId ?? null);
      setPdfExtracted(body.extracted ?? 0);
      // Honest status: a 422 zero-extraction response still carries a
      // real jobId and error message from upload_jobs — surface it as
      // a failure, not a silent success, per the "AI upload" known
      // pdf-extract.ts limitation.
      if (body.error) {
        setPdfPhase('failed');
        setPdfError(body.error);
        return;
      }
      setPdfPhase('done');
      await onContentChanged();
    } catch (err) {
      setPdfPhase('failed');
      setPdfError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [canStartPdf, questionsFile, notesFile, moduleCode, chapterId, onContentChanged]);

  // ---- JSON import ----
  const [jsonPhase, setJsonPhase] = useState<'idle' | 'processing' | 'done' | 'failed'>('idle');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonImported, setJsonImported] = useState(0);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const canStartJson = !!jsonFile && destinationReady && jsonPhase !== 'processing';

  const handleStartJson = useCallback(async () => {
    if (!canStartJson || !jsonFile) return;
    setJsonPhase('processing');
    setJsonError(null);
    try {
      const text = await jsonFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setJsonPhase('failed');
        setJsonError('That file is not valid JSON.');
        return;
      }
      const result = await importQuestionsJson({ moduleCode, chapterId, data: parsed });
      setJsonImported(result.imported);
      setJsonPhase('done');
      await onContentChanged();
    } catch (err) {
      setJsonPhase('failed');
      // The import route's own resolution-failure messages (e.g. an
      // unresolved reference_document) surface here verbatim.
      setJsonError(err instanceof Error ? err.message : 'Import failed');
    }
  }, [canStartJson, jsonFile, moduleCode, chapterId, onContentChanged]);

  const stepDefs = [
    { n: 1 as Step, label: 'Destination', hint: 'Module, subject & chapter' },
    { n: 2 as Step, label: 'Method', hint: 'Manual, PDF, or JSON' },
    { n: 3 as Step, label: 'Add questions', hint: 'Write, extract, or import' },
  ];

  if (destLoading) {
    return <div style={{ ...CARD, textAlign: 'center', color: '#64748B' }}>Loading modules…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', ...CARD, padding: '18px 24px' }}>
        {stepDefs.map((st, idx) => {
          const active = step === st.n;
          const done = step > st.n;
          return (
            <div key={st.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <button
                type="button"
                onClick={() => (done ? setStep(st.n) : undefined)}
                disabled={!done}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  flex: 'none',
                  cursor: done ? 'pointer' : 'default',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontFamily: 'inherit',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    background: active || done ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.04)',
                    color: active || done ? '#fff' : '#64748B',
                    border: `1px solid ${active || done ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  {done ? '✓' : st.n}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: active || done ? '#F8FAFC' : '#64748B' }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>{st.hint}</div>
                </div>
              </button>
              {idx < stepDefs.length - 1 && (
                <div style={{ flex: 1, height: 2, margin: '0 16px', background: done ? '#8B5CF6' : 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* STEP 1 — DESTINATION */}
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>1 · Module</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, marginBottom: 18 }}>
              Which module do these questions belong to?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflow: 'auto' }}>
              {modules.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748B' }}>No modules found.</div>
              )}
              {modules.map((m) => {
                const selected = moduleCode === m.code;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => setModuleCode(m.code)}
                    style={optionBtn(selected)}
                  >
                    <span style={codeChip}>{m.code}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </span>
                    {!m.is_active && <span style={{ fontSize: 9, color: '#64748B' }}>inactive</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>2 · Subject</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, marginBottom: 18 }}>
              In <b style={{ color: '#C4B5FD' }}>{currentModule?.code ?? '—'}</b>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflow: 'auto' }}>
              {subjects.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748B' }}>No subjects assigned to this module.</div>
              )}
              {subjects.map((s) => {
                const selected = subjectId === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setSubjectId(s.id)} style={optionBtn(selected)}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>3 · Chapter</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  In <b style={{ color: '#C4B5FD' }}>{currentSubject?.name ?? '—'}</b>
                </div>
              </div>
              <button type="button" onClick={() => setAddingChapter((v) => !v)} style={smallGhostBtn}>
                {addingChapter ? '× Cancel' : '+ Add'}
              </button>
            </div>

            {addingChapter && (
              <div style={{ marginTop: 16, padding: 16, background: '#0F0F1A', border: '1px dashed rgba(139,92,246,0.4)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#C4B5FD', marginBottom: 9 }}>New chapter name</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <input
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    placeholder="e.g. Motor Nervous System"
                    style={{ flex: 1, background: '#161B26', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '11px 13px', color: '#F8FAFC', fontSize: 13, fontFamily: 'inherit' }}
                  />
                  <button type="button" onClick={handleConfirmAddChapter} disabled={creatingChapter || !newChapterName.trim()} style={{ ...primaryBtnSm, opacity: creatingChapter || !newChapterName.trim() ? 0.5 : 1 }}>
                    {creatingChapter ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, maxHeight: 260, overflow: 'auto' }}>
              {chapters.length === 0 && !addingChapter && (
                <div style={{ fontSize: 12, color: '#64748B' }}>No chapters yet for this subject.</div>
              )}
              {chapters.map((c) => {
                const selected = chapterId === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setChapterId(c.id)} style={optionBtn(selected)}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: selected ? 700 : 500 }}>{c.name}</span>
                    <span style={{ fontSize: 10, color: '#64748B' }}>{c.published_count}/{c.question_count} pub</span>
                    {selected && <span style={{ fontSize: 13, color: '#8B5CF6' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>
              Publishing to{' '}
              <b style={{ color: '#F8FAFC' }}>
                {moduleCode || '—'} · {currentSubject?.name ?? '—'} · {currentChapter?.name ?? '—'}
              </b>
            </div>
            <button type="button" onClick={() => setStep(2)} disabled={!destinationReady} style={{ ...primaryBtn, opacity: destinationReady ? 1 : 0.4, cursor: destinationReady ? 'pointer' : 'not-allowed' }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — METHOD */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
            Publishing to <b style={{ color: '#F8FAFC' }}>{moduleCode} · {currentSubject?.name} · {currentChapter?.name}</b> — how would you like to add questions?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
            <MethodCard
              emoji="✍️"
              title="Write manually"
              desc="Type each question yourself, mark the correct answer, write your own explanation and page reference."
              cta="Start writing →"
              onClick={() => { setMode('manual'); setStep(3); }}
            />
            <MethodCard
              emoji="📄"
              title="Extract from PDF"
              desc="Upload a questions PDF (and optional notes PDF). Text extraction runs server-side; falls back to OCR if needed."
              cta="Upload a PDF →"
              onClick={() => { setMode('pdf'); setStep(3); setPdfPhase('idle'); }}
            />
            <MethodCard
              emoji="🗂️"
              title="Import JSON batch"
              desc="Upload a production-artifact JSON file. Upserts by question_id — safe to re-run on the same file."
              cta="Import a file →"
              onClick={() => { setMode('json'); setStep(3); setJsonPhase('idle'); }}
              highlight
            />
          </div>
          <div style={{ marginTop: 18 }}>
            <button type="button" onClick={() => setStep(1)} style={backLink}>← Back to destination</button>
          </div>
        </div>
      )}

      {/* STEP 3 — MANUAL */}
      {step === 3 && mode === 'manual' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22, alignItems: 'start' }}>
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Write a question</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>{moduleCode} · {currentChapter?.name ?? '—'}</div>

            <div style={LABEL}>Question stem</div>
            <textarea value={mqStem} onChange={(e) => setMqStem(e.target.value)} placeholder="e.g. Which layer of the epidermis contains actively dividing keratinocytes?" style={{ ...INPUT, minHeight: 74, resize: 'vertical' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#CBD5E1' }}>Answer options</div>
              <button type="button" onClick={() => mqOptions.length < 5 && setMqOptions([...mqOptions, ''])} disabled={mqOptions.length >= 5} style={{ fontSize: 11, fontWeight: 700, color: mqOptions.length >= 5 ? '#475569' : '#8B5CF6', cursor: mqOptions.length >= 5 ? 'default' : 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}>
                + Add option
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mqOptions.map((val, i) => {
                const isCorrect = mqCorrect === i;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <button type="button" onClick={() => setMqCorrect(i)} style={{ width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${isCorrect ? '#10B981' : 'rgba(255,255,255,0.18)'}`, background: isCorrect ? 'rgba(16,185,129,0.15)' : 'transparent', color: '#10B981', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, cursor: 'pointer', flex: 'none' }}>
                      {isCorrect ? '✓' : ''}
                    </button>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#64748B', width: 14, flex: 'none' }}>{OPTION_LETTERS[i]}</span>
                    <input
                      value={val}
                      onChange={(e) => { const next = [...mqOptions]; next[i] = e.target.value; setMqOptions(next); }}
                      placeholder={`Option ${OPTION_LETTERS[i]?.toUpperCase()}…`}
                      style={{ ...INPUT, flex: 1, padding: '11px 13px', borderRadius: 9 }}
                    />
                    {mqOptions.length > 2 && (
                      <button type="button" onClick={() => { const next = mqOptions.filter((_, j) => j !== i); let c = mqCorrect; if (c >= next.length) c = next.length - 1; setMqOptions(next); setMqCorrect(c); }} style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 15, color: '#64748B', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}>×</button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, ...LABEL }}>Explanation (optional)</div>
            <textarea value={mqExplanation} onChange={(e) => setMqExplanation(e.target.value)} placeholder="Explain why the correct answer is correct." style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginTop: 20 }}>
              <div>
                <div style={LABEL}>Reference text (optional)</div>
                <input value={mqReference} onChange={(e) => setMqReference(e.target.value)} placeholder="Free-text citation" style={{ ...INPUT, padding: '11px 13px', borderRadius: 9 }} />
              </div>
              <div>
                <div style={LABEL}>Page #</div>
                <input value={mqReferencePage} onChange={(e) => setMqReferencePage(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 42" style={{ ...INPUT, padding: '11px 13px', borderRadius: 9 }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 6 }}>
              The page number resolves against this module&apos;s assigned reference book, if one is set.
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ ...LABEL, marginBottom: 0 }}>Difficulty</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setMqDifficulty(d)} style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: mqDifficulty === d ? '#F8FAFC' : '#94A3B8', background: mqDifficulty === d ? 'rgba(124,58,237,0.16)' : 'transparent', border: `1px solid ${mqDifficulty === d ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`, fontFamily: 'inherit' }}>{d}</button>
                ))}
              </div>
            </div>

            <div style={reviewGateBox}>
              <span aria-hidden="true">🕓</span>
              <span>This question will be saved as <b style={{ color: '#F8FAFC' }}>under review</b>. Approve it from the Review Queue to publish.</span>
            </div>

            {saveError && <div role="alert" style={errorBox}>{saveError}</div>}

            <button type="button" onClick={handleAddQuestion} disabled={!canAddQuestion} style={{ ...bigPrimaryBtn, opacity: canAddQuestion ? 1 : 0.5, cursor: canAddQuestion ? 'pointer' : 'not-allowed' }}>
              {savingQuestion ? 'Saving…' : 'Save for review →'}
            </button>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>This session</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#8B5CF6', marginBottom: 4 }}>{sessionDrafts.length}</div>
            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 18 }}>{sessionDrafts.length === 1 ? 'question saved' : 'questions saved'}</div>
            {sessionDrafts.slice(0, 5).map((d) => (
              <div key={d.id} style={{ fontSize: 11.5, color: '#CBD5E1', padding: '10px 12px', background: '#0F0F1A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, marginBottom: 8 }}>
                #{d.id} · {d.stem}{d.stem.length >= 80 && '…'}
              </div>
            ))}
            <button type="button" onClick={() => setStep(2)} style={backLink}>← Change method</button>
          </div>
        </div>
      )}

      {/* STEP 3 — PDF */}
      {step === 3 && mode === 'pdf' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22 }}>
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Extract from PDF</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>{moduleCode} · {currentChapter?.name ?? '—'}</div>

            {(pdfPhase === 'idle' || pdfPhase === 'failed') && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <FileDropzone label="Questions PDF" hint="MCQs with a) / b) / c) options" required file={questionsFile} onFile={setQuestionsFile} accept=".pdf,application/pdf" />
                  <FileDropzone label="Notes PDF" hint="Optional — used for reference lookup" required={false} file={notesFile} onFile={setNotesFile} accept=".pdf,application/pdf" />
                </div>

                {pdfPhase === 'failed' && pdfError && (
                  <div role="alert" style={{ ...errorBox, marginTop: 14 }}>
                    {pdfError}
                    {pdfJobId && (
                      <div style={{ marginTop: 6, fontSize: 10, color: '#94A3B8' }}>
                        Job id: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pdfJobId.slice(0, 8)}</span>
                      </div>
                    )}
                  </div>
                )}

                <button type="button" onClick={handleStartPdf} disabled={!canStartPdf} style={{ ...bigPrimaryBtn, marginTop: 18, opacity: canStartPdf ? 1 : 0.5, cursor: canStartPdf ? 'pointer' : 'not-allowed' }}>
                  Extract &amp; queue for review →
                </button>
              </>
            )}

            {pdfPhase === 'processing' && (
              <div style={{ fontSize: 13, color: '#94A3B8' }}>Extracting on the server…</div>
            )}

            {pdfPhase === 'done' && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>✓ Extraction complete</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
                  <b style={{ color: '#F8FAFC' }}>{pdfExtracted}</b> question{pdfExtracted === 1 ? '' : 's'} extracted, queued as <b style={{ color: '#C4B5FD' }}>under review</b>.
                </div>
                <button type="button" onClick={() => { setPdfPhase('idle'); setQuestionsFile(null); setNotesFile(null); setPdfJobId(null); setPdfExtracted(0); setPdfError(null); }} style={primaryBtnSm}>
                  Upload another
                </button>
              </div>
            )}
          </div>

          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Review gate</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16, lineHeight: 1.5 }}>
              Every extracted question lands in the Review Queue tagged <b style={{ color: '#0EA5E9' }}>under_review</b>. A zero-extraction result is shown as a failure here, not a silent success — a known limitation in the current extraction pipeline means this can happen even on well-formatted files; use Manual entry or JSON import as a fallback.
            </div>
            <button type="button" onClick={() => setStep(2)} style={backLink}>← Change method</button>
          </div>
        </div>
      )}

      {/* STEP 3 — JSON IMPORT */}
      {step === 3 && mode === 'json' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22 }}>
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Import a JSON batch</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>{moduleCode} · {currentChapter?.name ?? '—'}</div>

            {(jsonPhase === 'idle' || jsonPhase === 'failed') && (
              <>
                <FileDropzone label="Production JSON" hint="production_metadata + questions[] shape" required file={jsonFile} onFile={setJsonFile} accept=".json,application/json" />

                {jsonPhase === 'failed' && jsonError && (
                  <div role="alert" style={{ ...errorBox, marginTop: 14 }}>{jsonError}</div>
                )}

                <button type="button" onClick={handleStartJson} disabled={!canStartJson} style={{ ...bigPrimaryBtn, marginTop: 18, opacity: canStartJson ? 1 : 0.5, cursor: canStartJson ? 'pointer' : 'not-allowed' }}>
                  Import &amp; queue for review →
                </button>
              </>
            )}

            {jsonPhase === 'processing' && <div style={{ fontSize: 13, color: '#94A3B8' }}>Importing…</div>}

            {jsonPhase === 'done' && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>✓ Import complete</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
                  <b style={{ color: '#F8FAFC' }}>{jsonImported}</b> question{jsonImported === 1 ? '' : 's'} created or updated, queued as <b style={{ color: '#C4B5FD' }}>under review</b>.
                </div>
                <button type="button" onClick={() => { setJsonPhase('idle'); setJsonFile(null); setJsonImported(0); setJsonError(null); }} style={primaryBtnSm}>
                  Import another
                </button>
              </div>
            )}
          </div>

          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>How this works</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16, lineHeight: 1.5 }}>
              Upserts by the file&apos;s own <code>question_id</code> — re-importing the same file updates existing rows instead of duplicating them. The reference page comes straight from each question&apos;s JSON value; the book comes from this module&apos;s assignment, not the file.
            </div>
            <button type="button" onClick={() => setStep(2)} style={backLink}>← Change method</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodCard({
  emoji,
  title,
  desc,
  cta,
  onClick,
  highlight,
}: {
  emoji: string;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: highlight ? 'linear-gradient(160deg,#1a1330,#161B26)' : '#161B26',
        border: `1px solid ${highlight ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 18,
        padding: 26,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        boxShadow: highlight ? '0 0 0 1px rgba(124,58,237,0.2), 0 0 30px rgba(124,58,237,0.12)' : 'none',
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, background: highlight ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${highlight ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, display: 'grid', placeItems: 'center', fontSize: 22, marginBottom: 16 }}>
        {emoji}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</div>
      <p style={{ fontSize: 12, color: '#94A3B8', margin: '9px 0 16px', lineHeight: 1.5 }}>{desc}</p>
      <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: highlight ? '#fff' : '#F8FAFC', background: highlight ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : 'transparent', border: highlight ? 'none' : '1px solid rgba(255,255,255,0.14)', padding: 11, borderRadius: 11, boxShadow: highlight ? '0 0 20px rgba(124,58,237,0.4)' : 'none' }}>
        {cta}
      </div>
    </button>
  );
}

function FileDropzone({
  label,
  hint,
  required,
  file,
  onFile,
  accept,
}: {
  label: string;
  hint: string;
  required: boolean;
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', padding: '18px 16px', border: `1.5px dashed ${file ? 'rgba(16,185,129,0.5)' : 'rgba(139,92,246,0.4)'}`, borderRadius: 12, background: file ? 'rgba(16,185,129,0.06)' : 'rgba(124,58,237,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
        <span style={{ fontSize: 9, color: required ? '#EF4444' : '#64748B', fontWeight: 700 }}>{required ? 'REQUIRED' : 'OPTIONAL'}</span>
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8' }}>{hint}</div>
      {file ? (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#10B981' }}>
          <span>📄 {file.name}</span>
          <button type="button" onClick={(e) => { e.preventDefault(); onFile(null); }} style={{ fontSize: 10, color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>× remove</button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>Click to choose a file (up to 10 MB)</div>
      )}
      <input
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) { alert('File is larger than 10 MB.'); return; }
          onFile(f);
        }}
      />
    </label>
  );
}

function optionBtn(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '12px 14px',
    borderRadius: 11,
    cursor: 'pointer',
    background: selected ? 'rgba(124,58,237,0.14)' : '#0F0F1A',
    border: `1px solid ${selected ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)'}`,
    textAlign: 'left',
    fontFamily: 'inherit',
    color: 'inherit',
    width: '100%',
  };
}

const codeChip: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  fontWeight: 700,
  color: '#C4B5FD',
  background: 'rgba(124,58,237,0.16)',
  border: '1px solid rgba(139,92,246,0.35)',
  padding: '4px 8px',
  borderRadius: 6,
  flex: 'none',
};

const smallGhostBtn: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: '#8B5CF6',
  border: '1px solid rgba(124,58,237,0.4)',
  padding: '7px 12px',
  borderRadius: 9,
  cursor: 'pointer',
  background: 'transparent',
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  padding: '13px 26px',
  borderRadius: 12,
  boxShadow: '0 0 22px rgba(124,58,237,0.4)',
  border: 'none',
  fontFamily: 'inherit',
};

const primaryBtnSm: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: '#fff',
  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  padding: '11px 18px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const bigPrimaryBtn: React.CSSProperties = {
  marginTop: 22,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 700,
  padding: 13,
  borderRadius: 12,
  color: '#fff',
  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  boxShadow: '0 0 20px rgba(124,58,237,0.35)',
  border: 'none',
  width: '100%',
  fontFamily: 'inherit',
};

const backLink: React.CSSProperties = {
  fontSize: 12,
  color: '#94A3B8',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  fontFamily: 'inherit',
};

const reviewGateBox: React.CSSProperties = {
  marginTop: 20,
  display: 'flex',
  gap: 10,
  padding: '12px 14px',
  background: 'rgba(14,165,233,0.08)',
  border: '1px solid rgba(14,165,233,0.28)',
  borderRadius: 10,
  fontSize: 12,
  color: '#7DD3FC',
};

const errorBox: React.CSSProperties = {
  padding: '10px 12px',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 10,
  fontSize: 12,
  color: '#FCA5A5',
};
