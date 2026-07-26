'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ModuleWithChapters,
  createChapter,
  createQuestion,
} from '@/lib/professor-api';

type Props = {
  modules: ModuleWithChapters[];
  onPublished: () => void | Promise<void>;
  onChapterCreated: () => void | Promise<void>;
};

type Step = 1 | 2 | 3;
type Mode = 'manual' | 'ai' | null;
type AiPhase = 'idle' | 'processing' | 'done' | 'failed';

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 24,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#CBD5E1',
  marginBottom: 8,
};

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

export function UploadWizard({ modules, onPublished, onChapterCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>(null);

  // Destination
  const activeModules = useMemo(() => modules.filter((m) => m.is_active), [modules]);
  const [upModuleCode, setUpModuleCode] = useState<string>('');
  const [upChapterId, setUpChapterId] = useState<string>('');
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [creatingChapter, setCreatingChapter] = useState(false);

  useEffect(() => {
    if (!upModuleCode && activeModules[0]) {
      setUpModuleCode(activeModules[0].code);
      setUpChapterId(activeModules[0].chapters[0]?.id ?? '');
    }
  }, [activeModules, upModuleCode]);

  const currentModule = modules.find((m) => m.code === upModuleCode) ?? null;
  const currentChapter =
    currentModule?.chapters.find((c) => c.id === upChapterId) ?? null;

  // Manual builder
  const [mqStem, setMqStem] = useState('');
  const [mqOptions, setMqOptions] = useState<string[]>(['', '', '']);
  const [mqCorrect, setMqCorrect] = useState(0);
  const [mqExplanation, setMqExplanation] = useState('');
  const [mqReference, setMqReference] = useState('');
  const [mqDifficulty, setMqDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [sessionDrafts, setSessionDrafts] = useState<{ id: number; stem: string }[]>([]);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Both manual and AI paths land at under_review — every new
  // question requires a professor review pass in the Question
  // Bank before students see it. Nothing here publishes directly.

  const canAddQuestion =
    mqStem.trim().length >= 10 &&
    mqOptions.filter((o) => o.trim()).length >= 2 &&
    !!currentChapter &&
    !!upChapterId &&
    !savingQuestion;

  // AI wizard — two files (questions PDF + notes PDF).
  // The notes file is used to auto-fill each question's reference
  // page. Text extraction is server-side (pdf-parse); OCR would
  // run client-side in a future revision to keep server cost at 0.
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle');
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiStageIdx, setAiStageIdx] = useState(0);
  const [aiExtracted, setAiExtracted] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);

  const AI_STAGES = [
    'Extracting text (pdf-parse)',
    'Detecting MCQ patterns',
    'Cross-referencing notes',
    'Saving as under_review',
  ];

  const resetManual = useCallback(() => {
    setMqStem('');
    setMqOptions(['', '', '']);
    setMqCorrect(0);
    setMqExplanation('');
    setMqReference('');
    setMqDifficulty('medium');
    setSaveError(null);
  }, []);

  const handleAddOption = useCallback(() => {
    if (mqOptions.length >= 5) return;
    setMqOptions([...mqOptions, '']);
  }, [mqOptions]);

  const handleRemoveOption = useCallback(
    (i: number) => {
      if (mqOptions.length <= 2) return;
      const next = mqOptions.filter((_, j) => j !== i);
      let correct = mqCorrect;
      if (correct >= next.length) correct = next.length - 1;
      if (correct === i && correct > 0) correct = 0;
      setMqOptions(next);
      setMqCorrect(correct);
    },
    [mqOptions, mqCorrect]
  );

  const handleAddQuestion = useCallback(async () => {
    if (!canAddQuestion || !currentModule || !currentChapter) return;
    setSavingQuestion(true);
    setSaveError(null);
    try {
      const choices = mqOptions
        .map((text, i) => ({ id: OPTION_LETTERS[i], text: text.trim() }))
        .filter((c) => c.text);
      const correctId = OPTION_LETTERS[mqCorrect] ?? 'a';
      const { question } = await createQuestion({
        chapterId: currentChapter.id,
        subjectId: currentModule.subject_id,
        question: mqStem.trim(),
        choices,
        correctAnswer: correctId,
        explanation: mqExplanation.trim(),
        reference: mqReference.trim(),
        difficulty: mqDifficulty,
        source: 'manual',
        // Always under_review — no direct publish. Students see
        // the question only after the professor approves it from
        // the Question Bank.
        status: 'under_review',
      });
      setSessionDrafts((prev) => [
        { id: question.id, stem: mqStem.trim().slice(0, 80) },
        ...prev,
      ]);
      resetManual();
      await onPublished();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  }, [
    canAddQuestion,
    currentModule,
    currentChapter,
    mqOptions,
    mqCorrect,
    mqStem,
    mqExplanation,
    mqReference,
    mqDifficulty,
    onPublished,
    resetManual,
  ]);

  const canStartAi =
    !!questionsFile && !!currentModule && !!currentChapter && aiPhase !== 'processing';

  const handleStartAi = useCallback(async () => {
    if (!canStartAi || !questionsFile || !currentModule || !currentChapter) return;
    setAiPhase('processing');
    setAiStageIdx(0);
    setAiError(null);
    setAiExtracted(0);
    setAiJobId(null);

    // Client-side stage animation runs in parallel with the real
    // server call. The stages are honest — pdf-parse really does
    // run in this order; the animation is just paced pleasantly.
    const timers: number[] = [];
    for (let i = 0; i < AI_STAGES.length; i++) {
      timers.push(
        window.setTimeout(() => setAiStageIdx(i + 1), (i + 1) * 700)
      );
    }

    try {
      const form = new FormData();
      form.append('moduleCode', currentModule.code);
      form.append('chapterId', currentChapter.id);
      form.append('questions', questionsFile);
      if (notesFile) form.append('notes', notesFile);

      const res = await fetch('/api/professor/upload-extract', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      timers.forEach((t) => window.clearTimeout(t));

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
        extracted?: number;
      };

      if (!res.ok) {
        setAiPhase('failed');
        setAiError(body.error ?? `HTTP ${res.status}`);
        if (body.jobId) setAiJobId(body.jobId);
        return;
      }

      setAiJobId(body.jobId ?? null);
      setAiExtracted(body.extracted ?? 0);
      setAiStageIdx(AI_STAGES.length);
      setAiPhase('done');
      await onPublished();
    } catch (err) {
      timers.forEach((t) => window.clearTimeout(t));
      setAiPhase('failed');
      setAiError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [
    canStartAi,
    questionsFile,
    notesFile,
    currentModule,
    currentChapter,
    onPublished,
    AI_STAGES.length,
  ]);

  const handleConfirmAddChapter = useCallback(async () => {
    if (!newChapterName.trim() || !currentModule) return;
    setCreatingChapter(true);
    try {
      const { chapter } = await createChapter({
        moduleCode: currentModule.code,
        name: newChapterName.trim(),
      });
      await onChapterCreated();
      setUpChapterId(chapter.id);
      setAddingChapter(false);
      setNewChapterName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add chapter');
    } finally {
      setCreatingChapter(false);
    }
  }, [newChapterName, currentModule, onChapterCreated]);

  const stepDefs = [
    { n: 1 as Step, label: 'Destination', hint: 'Module & chapter' },
    { n: 2 as Step, label: 'Method', hint: 'Manual or AI' },
    { n: 3 as Step, label: 'Add questions', hint: 'Write or extract' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stepper */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          ...CARD,
          padding: '18px 24px',
        }}
      >
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
                    background:
                      active || done
                        ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
                        : 'rgba(255,255,255,0.04)',
                    color: active || done ? '#fff' : '#64748B',
                    border: `1px solid ${active || done ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  {done ? '✓' : st.n}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: active || done ? '#F8FAFC' : '#64748B',
                    }}
                  >
                    {st.label}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>{st.hint}</div>
                </div>
              </button>
              {idx < stepDefs.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    margin: '0 16px',
                    background: done ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* STEP 1 — DESTINATION */}
      {step === 1 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>1 · Choose a module</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, marginBottom: 18 }}>
              Which module will these questions be published under?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeModules.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  No active modules yet. Ask an admin to assign you as the professor of a subject.
                </div>
              )}
              {activeModules.map((m) => {
                const selected = upModuleCode === m.code;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => {
                      setUpModuleCode(m.code);
                      setUpChapterId(m.chapters[0]?.id ?? '');
                    }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: selected ? 'rgba(124,58,237,0.14)' : '#0F0F1A',
                      border: `1px solid ${selected ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)'}`,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#C4B5FD',
                            background: 'rgba(124,58,237,0.16)',
                            border: '1px solid rgba(139,92,246,0.35)',
                            padding: '4px 8px',
                            borderRadius: 6,
                            flex: 'none',
                          }}
                        >
                          HIST {m.code}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {m.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: '#64748B', flex: 'none' }}>
                        {m.chapters.length} ch
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>2 · Choose a chapter</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  In{' '}
                  <b style={{ color: '#C4B5FD' }}>HIST {upModuleCode || '—'}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddingChapter((v) => !v)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#8B5CF6',
                  border: '1px solid rgba(124,58,237,0.4)',
                  padding: '7px 12px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  background: 'transparent',
                  fontFamily: 'inherit',
                }}
              >
                {addingChapter ? '× Cancel' : '+ Add chapter'}
              </button>
            </div>

            {addingChapter && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: '#0F0F1A',
                  border: '1px dashed rgba(139,92,246,0.4)',
                  borderRadius: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: '#C4B5FD', marginBottom: 9 }}>
                  New chapter name
                </div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <input
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    placeholder="e.g. Connective Tissue Proper"
                    style={{
                      flex: 1,
                      background: '#161B26',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 9,
                      padding: '11px 13px',
                      color: '#F8FAFC',
                      fontSize: 13,
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleConfirmAddChapter}
                    disabled={creatingChapter || !newChapterName.trim()}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#fff',
                      background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                      padding: '11px 18px',
                      borderRadius: 9,
                      cursor: creatingChapter ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      border: 'none',
                      opacity: creatingChapter || !newChapterName.trim() ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {creatingChapter ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 16,
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              {(currentModule?.chapters ?? []).map((c) => {
                const selected = upChapterId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setUpChapterId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '12px 14px',
                      borderRadius: 11,
                      cursor: 'pointer',
                      background: selected ? 'rgba(124,58,237,0.12)' : '#0F0F1A',
                      border: `1px solid ${selected ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: selected ? '#8B5CF6' : '#475569',
                        flex: 'none',
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: selected ? 700 : 500,
                      }}
                    >
                      {c.name}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748B' }}>
                      {c.published_count}/{c.question_count} pub
                    </span>
                    {selected && <span style={{ fontSize: 13, color: '#8B5CF6' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 2,
            }}
          >
            <div style={{ fontSize: 12, color: '#94A3B8' }}>
              Publishing to{' '}
              <b style={{ color: '#F8FAFC' }}>
                HIST {upModuleCode || '—'} · {currentChapter?.name ?? '—'}
              </b>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!currentChapter}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: currentChapter
                  ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
                  : 'rgba(255,255,255,0.04)',
                padding: '13px 26px',
                borderRadius: 12,
                boxShadow: currentChapter ? '0 0 22px rgba(124,58,237,0.4)' : 'none',
                cursor: currentChapter ? 'pointer' : 'not-allowed',
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — METHOD */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
            Publishing to{' '}
            <b style={{ color: '#F8FAFC' }}>
              HIST {upModuleCode} · {currentChapter?.name ?? '—'}
            </b>{' '}
            — how would you like to add questions?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setStep(3);
              }}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: '#161B26',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 18,
                padding: 28,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 24,
                  marginBottom: 18,
                }}
              >
                ✍️
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
                Write manually
              </div>
              <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '10px 0 18px', lineHeight: 1.55 }}>
                Type each question yourself, add up to 5 multiple-choice options, mark the correct
                answer, and write your own explanation and reference.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 11.5,
                  color: '#CBD5E1',
                }}
              >
                <div style={{ display: 'flex', gap: 9 }}>
                  <span style={{ color: '#8B5CF6' }}>◆</span>Full control over wording
                </div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <span style={{ color: '#8B5CF6' }}>◆</span>Up to 5 options per question
                </div>
              </div>
              <div
                style={{
                  marginTop: 22,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#F8FAFC',
                  border: '1px solid rgba(255,255,255,0.14)',
                  padding: 12,
                  borderRadius: 11,
                }}
              >
                Start writing →
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('ai');
                setStep(3);
                setAiPhase('idle');
              }}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: 'linear-gradient(160deg,#1a1330,#161B26)',
                border: '1px solid rgba(139,92,246,0.5)',
                borderRadius: 18,
                padding: 28,
                cursor: 'pointer',
                boxShadow:
                  '0 0 0 1px rgba(124,58,237,0.2), 0 0 30px rgba(124,58,237,0.12)',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#fff',
                  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                  padding: '4px 10px',
                  borderRadius: 6,
                }}
              >
                RECOMMENDED
              </div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'rgba(124,58,237,0.18)',
                  border: '1px solid rgba(139,92,246,0.4)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 24,
                  marginBottom: 18,
                }}
              >
                ✨
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
                AI authoring
              </div>
              <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '10px 0 18px', lineHeight: 1.55 }}>
                Upload a PDF or DOCX of your questions or lecture notes. AI extracts the questions,
                matches the correct answers, and pulls the reference page automatically.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 11.5,
                  color: '#CBD5E1',
                }}
              >
                <div style={{ display: 'flex', gap: 9 }}>
                  <span style={{ color: '#8B5CF6' }}>◆</span>Extracts questions &amp; answers
                </div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <span style={{ color: '#8B5CF6' }}>◆</span>Auto-cites the reference page
                </div>
              </div>
              <div
                style={{
                  marginTop: 22,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                  padding: 12,
                  borderRadius: 11,
                  boxShadow: '0 0 20px rgba(124,58,237,0.4)',
                }}
              >
                Upload a document →
              </div>
            </button>
          </div>
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                fontSize: 12,
                color: '#94A3B8',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              ← Back to destination
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — MANUAL */}
      {step === 3 && mode === 'manual' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 22,
            alignItems: 'start',
          }}
        >
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Write a question
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>
              HIST {upModuleCode} · {currentChapter?.name ?? '—'}
            </div>

            <div style={LABEL}>Question stem</div>
            <textarea
              value={mqStem}
              onChange={(e) => setMqStem(e.target.value)}
              placeholder="e.g. Which type of epithelium lines the alveoli of the lung?"
              style={{
                ...INPUT,
                minHeight: 74,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, textAlign: 'right' }}>
              {mqStem.length}/2000
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '20px 0 10px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#CBD5E1' }}>
                Answer options{' '}
                <span style={{ color: '#64748B' }}>· click the circle to mark correct</span>
              </div>
              <button
                type="button"
                onClick={handleAddOption}
                disabled={mqOptions.length >= 5}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: mqOptions.length >= 5 ? '#475569' : '#8B5CF6',
                  cursor: mqOptions.length >= 5 ? 'default' : 'pointer',
                  background: 'transparent',
                  border: 'none',
                  fontFamily: 'inherit',
                }}
              >
                + Add option
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mqOptions.map((val, i) => {
                const isCorrect = mqCorrect === i;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <button
                      type="button"
                      onClick={() => setMqCorrect(i)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        border: `1.5px solid ${isCorrect ? '#10B981' : 'rgba(255,255,255,0.18)'}`,
                        background: isCorrect ? 'rgba(16,185,129,0.15)' : 'transparent',
                        color: '#10B981',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: 'pointer',
                        flex: 'none',
                      }}
                      aria-label={`Mark option ${OPTION_LETTERS[i]} as correct`}
                    >
                      {isCorrect ? '✓' : ''}
                    </button>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#64748B',
                        width: 14,
                        flex: 'none',
                        textTransform: 'uppercase',
                      }}
                    >
                      {OPTION_LETTERS[i]}
                    </span>
                    <input
                      value={val}
                      onChange={(e) => {
                        const next = [...mqOptions];
                        next[i] = e.target.value;
                        setMqOptions(next);
                      }}
                      placeholder={`Option ${OPTION_LETTERS[i]?.toUpperCase()}…`}
                      style={{
                        ...INPUT,
                        flex: 1,
                        padding: '11px 13px',
                        borderRadius: 9,
                      }}
                    />
                    {mqOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(i)}
                        style={{
                          width: 30,
                          height: 30,
                          flex: 'none',
                          borderRadius: 8,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 15,
                          color: '#64748B',
                          border: '1px solid rgba(255,255,255,0.1)',
                          cursor: 'pointer',
                          background: 'transparent',
                          fontFamily: 'inherit',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, ...LABEL }}>Explanation (optional)</div>
            <textarea
              value={mqExplanation}
              onChange={(e) => setMqExplanation(e.target.value)}
              placeholder="Explain why the correct answer is correct."
              style={{ ...INPUT, minHeight: 60, resize: 'vertical' }}
            />

            <div style={{ marginTop: 20, ...LABEL }}>Reference (optional)</div>
            <input
              value={mqReference}
              onChange={(e) => setMqReference(e.target.value)}
              placeholder="e.g. Junqueira Ch. 5, p. 91"
              style={{ ...INPUT, padding: '11px 13px', borderRadius: 9 }}
            />

            <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ ...LABEL, marginBottom: 0 }}>Difficulty</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMqDifficulty(d)}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      padding: '6px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: mqDifficulty === d ? '#F8FAFC' : '#94A3B8',
                      background:
                        mqDifficulty === d
                          ? 'rgba(124,58,237,0.16)'
                          : 'transparent',
                      border: `1px solid ${mqDifficulty === d ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      fontFamily: 'inherit',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Review gate — every new question lands in
                under_review and needs an explicit approve in the
                Question Bank before students see it. This is the
                same gate the AI-authoring path uses. */}
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                gap: 10,
                padding: '12px 14px',
                background: 'rgba(14,165,233,0.08)',
                border: '1px solid rgba(14,165,233,0.28)',
                borderRadius: 10,
                fontSize: 12,
                color: '#7DD3FC',
              }}
            >
              <span aria-hidden="true">🕓</span>
              <span>
                This question will be saved as <b style={{ color: '#F8FAFC' }}>under review</b>.
                Approve it from the Question Bank to publish it to students.
              </span>
            </div>

            {saveError && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#FCA5A5',
                }}
              >
                {saveError}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddQuestion}
              disabled={!canAddQuestion}
              style={{
                marginTop: 22,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 700,
                padding: 13,
                borderRadius: 12,
                cursor: canAddQuestion ? 'pointer' : 'not-allowed',
                color: canAddQuestion ? '#fff' : '#64748B',
                background: canAddQuestion
                  ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
                  : 'rgba(255,255,255,0.04)',
                boxShadow: canAddQuestion ? '0 0 20px rgba(124,58,237,0.35)' : 'none',
                border: 'none',
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              {savingQuestion ? 'Saving…' : 'Save for review →'}
            </button>
          </div>

          {/* Session sidebar */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              This session
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 14 }}>
              Questions added since you opened this wizard
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#8B5CF6',
                letterSpacing: '-0.02em',
                marginBottom: 4,
              }}
            >
              {sessionDrafts.length}
            </div>
            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 18 }}>
              {sessionDrafts.length === 1 ? 'question saved' : 'questions saved'}
            </div>

            {sessionDrafts.slice(0, 5).map((d) => (
              <div
                key={d.id}
                style={{
                  fontSize: 11.5,
                  color: '#CBD5E1',
                  padding: '10px 12px',
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 9,
                  marginBottom: 8,
                }}
              >
                #{d.id} · {d.stem}
                {d.stem.length >= 80 && '…'}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                marginTop: 8,
                fontSize: 11.5,
                color: '#94A3B8',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Change method
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — AI (two-file uploader) */}
      {step === 3 && mode === 'ai' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 22 }}>
          <div style={CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              AI authoring
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>
              HIST {upModuleCode} · {currentChapter?.name ?? '—'}
            </div>

            {(aiPhase === 'idle' || aiPhase === 'failed') && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <TwoFileDropzone
                    label="Questions PDF"
                    hint="MCQs with a) / b) / c) options"
                    required
                    file={questionsFile}
                    onFile={setQuestionsFile}
                  />
                  <TwoFileDropzone
                    label="Notes PDF"
                    hint="Lecture notes — used to auto-cite references"
                    required={false}
                    file={notesFile}
                    onFile={setNotesFile}
                  />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 11.5,
                    color: '#94A3B8',
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    lineHeight: 1.5,
                  }}
                >
                  <b style={{ color: '#C4B5FD' }}>How this saves API cost:</b>{' '}
                  we run pdf-parse locally to pull the text and a regex parser
                  to find MCQ patterns. Nothing goes to an LLM unless the
                  regex path detects zero questions.
                </div>

                {aiPhase === 'failed' && aiError && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      borderRadius: 12,
                      fontSize: 12.5,
                      color: '#FCA5A5',
                    }}
                  >
                    {aiError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartAi}
                  disabled={!canStartAi}
                  style={{
                    marginTop: 18,
                    width: '100%',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: 13,
                    borderRadius: 12,
                    cursor: canStartAi ? 'pointer' : 'not-allowed',
                    color: canStartAi ? '#fff' : '#64748B',
                    background: canStartAi
                      ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
                      : 'rgba(255,255,255,0.04)',
                    boxShadow: canStartAi ? '0 0 20px rgba(124,58,237,0.35)' : 'none',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  Extract &amp; queue for review →
                </button>
              </>
            )}

            {aiPhase === 'processing' && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {questionsFile?.name}
                  {notesFile && (
                    <span style={{ color: '#94A3B8', fontWeight: 400 }}>
                      {' '}
                      · notes: {notesFile.name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>
                  Extracting on the server — no LLM call yet
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {AI_STAGES.map((stage, i) => {
                    const done = i < aiStageIdx;
                    const active = i === aiStageIdx;
                    return (
                      <div
                        key={stage}
                        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 11,
                            fontWeight: 800,
                            background: done
                              ? '#10B981'
                              : active
                                ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
                                : 'rgba(255,255,255,0.04)',
                            color: done || active ? '#fff' : '#64748B',
                          }}
                        >
                          {done ? '✓' : active ? '…' : i + 1}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: done ? '#94A3B8' : active ? '#F8FAFC' : '#64748B',
                          }}
                        >
                          {stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiPhase === 'done' && (
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#10B981',
                    marginBottom: 8,
                  }}
                >
                  ✓ Extraction complete
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
                  <b style={{ color: '#F8FAFC' }}>{aiExtracted}</b> question
                  {aiExtracted === 1 ? '' : 's'} extracted from{' '}
                  <b style={{ color: '#F8FAFC' }}>{questionsFile?.name}</b>. They're queued
                  as <b style={{ color: '#C4B5FD' }}>under review</b> — open the Question
                  Bank to approve them before students see them.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAiPhase('idle');
                    setQuestionsFile(null);
                    setNotesFile(null);
                    setAiJobId(null);
                    setAiStageIdx(0);
                    setAiExtracted(0);
                    setAiError(null);
                  }}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: '11px 18px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Upload another
                </button>
              </div>
            )}
          </div>

          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Review gate
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16, lineHeight: 1.5 }}>
              Every AI-extracted question lands in the Question Bank tagged{' '}
              <b style={{ color: '#0EA5E9' }}>under_review</b>. Students never
              see a question until you approve it there.
            </div>
            {aiJobId && (
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Job id: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{aiJobId.slice(0, 8)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                marginTop: 16,
                fontSize: 11.5,
                color: '#94A3B8',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Change method
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TwoFileDropzone({
  label,
  hint,
  required,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  required: boolean;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
        padding: '18px 16px',
        border: `1.5px dashed ${file ? 'rgba(16,185,129,0.5)' : 'rgba(139,92,246,0.4)'}`,
        borderRadius: 12,
        background: file ? 'rgba(16,185,129,0.06)' : 'rgba(124,58,237,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
        {required && (
          <span style={{ fontSize: 9, color: '#EF4444', fontWeight: 700 }}>REQUIRED</span>
        )}
        {!required && (
          <span style={{ fontSize: 9, color: '#64748B', fontWeight: 700 }}>OPTIONAL</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8' }}>{hint}</div>
      {file ? (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            color: '#10B981',
          }}
        >
          <span>📄 {file.name}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onFile(null);
            }}
            style={{
              fontSize: 10,
              color: '#94A3B8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            × remove
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
          Click to choose a PDF (up to 10 MB)
        </div>
      )}
      <input
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            alert('File is larger than 10 MB.');
            return;
          }
          onFile(f);
        }}
      />
    </label>
  );
}
