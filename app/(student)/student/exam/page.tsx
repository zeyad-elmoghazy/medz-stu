'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, CheckIcon, SpinnerIcon } from '@/components/icons';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { fetchModulesByYear, type CatalogueModule, type ModulesByYear } from '@/lib/catalogue-api';
import { moduleLabel } from '@/lib/dashboard-data';
import {
  CustomExamApiError,
  createCustomExam,
  discardCustomExam,
  fetchActiveExam,
  fetchExamCatalogue,
  type ActiveExam,
  type ExamCatalogue,
} from '@/lib/custom-exam-api';
import {
  allChapterIds,
  availableQuestionCount,
  clampQuestionCount,
  pruneChapterSelection,
  quickCountOptions,
} from '@/lib/custom-exam-rules';
import { LinkPending } from '@/components/ui/LinkPending';

/**
 * Custom Exam builder. Four sections, always visible: Module (one),
 * Subjects (several, from that module), Chapters (several, from those
 * subjects) and Number of questions — which can never exceed what the
 * chosen chapters actually hold (the maximum is shown under the field,
 * and clamped on typing, paste, stepper and chips; the server re-checks
 * against a live count). Generating draws the exam on the server and
 * opens it in the quiz (app/(student)/student/quiz/exam/[examId]).
 */

const DEFAULT_COUNT = 20;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function CustomExamPage() {
  const router = useRouter();

  // ---- Reference data -------------------------------------------------
  const [modules, setModules] = useState<ModulesByYear | null>(null);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [modulesReload, setModulesReload] = useState(0);
  const [active, setActive] = useState<ActiveExam | null>(null);

  // ---- Selection ------------------------------------------------------
  const [moduleCode, setModuleCode] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<ExamCatalogue | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  // What the student asked for (null = the default). The count actually
  // used is always derived and clamped to the pool below.
  const [requested, setRequested] = useState<number | null>(null);
  // Text in the box while it is being edited (null = show the count).
  const [draft, setDraft] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  // ---- Actions --------------------------------------------------------
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Guards against a slow response for a module the student already left.
  const catalogueRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchModulesByYear()
      .then((d) => {
        if (!cancelled) {
          setModules(d);
          setModulesError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setModulesError(err instanceof Error ? err.message : 'Failed to load modules');
        }
      });
    // Non-fatal: without it the banner simply doesn't show.
    fetchActiveExam()
      .then((a) => {
        if (!cancelled) setActive(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modulesReload]);

  function loadCatalogue(code: string) {
    const request = ++catalogueRequest.current;
    setCatalogueLoading(true);
    setCatalogueError(null);
    fetchExamCatalogue(code)
      .then((c) => {
        if (catalogueRequest.current === request) setCatalogue(c);
      })
      .catch((err) => {
        if (catalogueRequest.current === request) {
          setCatalogueError(err instanceof Error ? err.message : 'Failed to load subjects');
        }
      })
      .finally(() => {
        if (catalogueRequest.current === request) setCatalogueLoading(false);
      });
  }

  function selectModule(code: string) {
    if (code === moduleCode) return;
    setModuleCode(code);
    setCatalogue(null);
    setSubjectIds([]);
    setChapterIds([]);
    setRequested(null);
    setDraft(null);
    setCapped(false);
    setGenerateError(null);
    setConfirmReplace(false);
    loadCatalogue(code);
  }

  const subjects = useMemo(() => catalogue?.subjects ?? [], [catalogue]);
  const selectableSubjectIds = useMemo(
    () => subjects.filter((s) => s.publishedCount > 0).map((s) => s.id),
    [subjects]
  );
  const selectableChapterIds = useMemo(
    () => allChapterIds(subjects, subjectIds),
    [subjects, subjectIds]
  );

  // The one place a selection change goes through: it drops chapters
  // whose subject was deselected and bakes the new pool size into the
  // requested count, so the number can't bounce back up later.
  function commitSelection(nextSubjects: string[], nextChapters: string[]) {
    const chapters = pruneChapterSelection(subjects, nextSubjects, nextChapters);
    const nextMax = availableQuestionCount(subjects, nextSubjects, chapters);
    setSubjectIds(nextSubjects);
    setChapterIds(chapters);
    setRequested((prev) => {
      if (nextMax === 0) return null;
      return prev !== null && prev > nextMax ? nextMax : prev;
    });
    setDraft(null);
    setCapped(false);
    setGenerateError(null);
    setConfirmReplace(false);
  }

  function toggleSubject(id: string) {
    commitSelection(
      subjectIds.includes(id) ? subjectIds.filter((s) => s !== id) : [...subjectIds, id],
      chapterIds
    );
  }

  function toggleChapter(id: string) {
    commitSelection(
      subjectIds,
      chapterIds.includes(id) ? chapterIds.filter((c) => c !== id) : [...chapterIds, id]
    );
  }

  // ---- Derived count --------------------------------------------------
  const max = availableQuestionCount(subjects, subjectIds, chapterIds);
  const defaultCount = Math.min(DEFAULT_COUNT, max);
  const count =
    max === 0 ? 0 : requested === null ? defaultCount : clampQuestionCount(requested, max);
  const shown = draft ?? (max === 0 ? '' : String(count));
  // While the box is empty or "0" mid-edit there is no valid count yet.
  const effectiveCount = draft !== null && (draft === '' || Number(draft) < 1) ? 0 : count;

  function onCountChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setGenerateError(null);
    setConfirmReplace(false);
    if (digits === '') {
      setDraft('');
      setCapped(false);
      return;
    }
    const n = Number(digits);
    if (n > max) {
      setCapped(true);
      setRequested(max);
      setDraft(String(max));
    } else {
      setCapped(false);
      setRequested(n);
      setDraft(digits);
    }
  }

  function setCount(n: number) {
    setRequested(clampQuestionCount(n, max));
    setDraft(null);
    setCapped(false);
    setGenerateError(null);
    setConfirmReplace(false);
  }

  const canGenerate =
    !!moduleCode && chapterIds.length > 0 && max > 0 && effectiveCount >= 1 && effectiveCount <= max;

  async function generate() {
    if (!canGenerate || generating || !moduleCode) return;
    // Starting a new exam replaces the unfinished one — ask first.
    if (active && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const { examId } = await createCustomExam({
        moduleCode,
        chapterIds,
        count: effectiveCount,
      });
      router.push(`/student/quiz/exam/${examId}`);
    } catch (err) {
      if (err instanceof CustomExamApiError && err.available !== undefined) {
        // Our numbers were out of date: say so and refresh them.
        setGenerateError(err.message);
        loadCatalogue(moduleCode);
      } else {
        setGenerateError(
          err instanceof Error ? err.message : "Couldn't create the exam. Please try again."
        );
      }
      setConfirmReplace(false);
      setGenerating(false);
    }
  }

  async function discardActive() {
    if (!active || discarding) return;
    setDiscarding(true);
    const ok = await discardCustomExam(active.id);
    setDiscarding(false);
    if (ok) {
      setActive(null);
      setConfirmReplace(false);
    } else {
      setGenerateError("Couldn't discard your unfinished exam. Check your connection and try again.");
    }
  }

  const selectedModule: CatalogueModule | null = useMemo(() => {
    if (!modules || !moduleCode) return null;
    for (const y of modules.years) {
      const m = y.modules.find((mod) => mod.code === moduleCode);
      if (m) return m;
    }
    return null;
  }, [modules, moduleCode]);

  const summary = [
    selectedModule ? `Module ${selectedModule.code}` : 'No module yet',
    subjectIds.length > 0 ? plural(subjectIds.length, 'subject') : null,
    chapterIds.length > 0 ? plural(chapterIds.length, 'chapter') : null,
    effectiveCount > 0 ? plural(effectiveCount, 'question') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans), system-ui, sans-serif' }}>
      <StudentNavbar activeLabel="Custom Exam" />
      <div className="mz-exam-wrap" style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 32px 80px' }}>
        <header style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--accent-text)', textTransform: 'uppercase' }}>
            Custom Exam Generator
          </p>
          <h1 className="mz-h1" style={{ margin: '10px 0 8px', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            Build your own practice exam
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text3)', margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
            Choose a module, then the subjects and chapters to draw from. Pick how many questions you
            want and we&apos;ll mix them into one exam.
          </p>
        </header>

        {active && (
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '16px 18px',
              borderRadius: 16,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
                Unfinished exam
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4, overflowWrap: 'anywhere' }}>
                {moduleLabel(active.moduleCode, active.moduleName)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                {active.answered} of {active.total} answered · {plural(active.chapterCount, 'chapter')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href={`/student/quiz/exam/${active.id}`}
                className="mz-tap"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#F7F9FA',
                  background: 'var(--accent-text)',
                  padding: '10px 18px',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                Continue
                <ArrowRightIcon size={14} />
                <LinkPending />
              </Link>
              <button
                type="button"
                onClick={discardActive}
                disabled={discarding}
                className="mz-tap"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  background: 'transparent',
                  border: '1px solid var(--line2)',
                  padding: '10px 16px',
                  borderRadius: 10,
                  cursor: discarding ? 'default' : 'pointer',
                  opacity: discarding ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {discarding ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          </div>
        )}

        {/* 1 — Module */}
        <Section id="exam-module" title="1. Module" hint="Choose one module.">
          {modulesError && (
            <div role="alert" style={errorBoxStyle}>
              <span>{modulesError}</span>
              <button
                type="button"
                onClick={() => {
                  setModulesError(null);
                  setModulesReload((n) => n + 1);
                }}
                className="mz-tap"
                style={retryStyle}
              >
                Try again
              </button>
            </div>
          )}
          {!modules && !modulesError && (
            <div className="mz-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton-shimmer" style={{ height: 92, borderRadius: 12 }} />
              ))}
            </div>
          )}
          {modules && (
            <div role="radiogroup" aria-labelledby="exam-module" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {modules.years
                .filter((y) => y.modules.length > 0)
                .map((y) => (
                  <div key={y.year}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
                      {y.label}
                    </div>
                    <div className="mz-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {y.modules.map((m) => {
                        const comingSoon = m.publishedCount === 0;
                        const selected = moduleCode === m.code;
                        return (
                          <button
                            key={m.code}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={comingSoon}
                            onClick={() => selectModule(m.code)}
                            className="mz-tap"
                            style={{
                              ...tileStyle(selected, comingSoon),
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={codeBadgeStyle}>MODULE {m.code}</span>
                              {comingSoon && <span style={soonBadgeStyle}>Coming soon</span>}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
                              {m.name}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                              {comingSoon
                                ? 'No published questions yet'
                                : `${plural(m.subjectCount, 'subject')} · ${plural(m.publishedCount, 'question')}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Section>

        {/* 2 — Subjects */}
        <Section
          id="exam-subjects"
          title="2. Subjects"
          hint="Choose one or more subjects from this module."
          actions={
            moduleCode && subjects.length > 0 ? (
              <SelectionActions
                selected={subjectIds.length}
                total={selectableSubjectIds.length}
                allLabel="Select all subjects"
                onAll={() => commitSelection(selectableSubjectIds, chapterIds)}
                onClear={() => commitSelection([], [])}
              />
            ) : null
          }
        >
          {!moduleCode && <Waiting>Choose a module first.</Waiting>}
          {moduleCode && catalogueLoading && !catalogue && (
            <div style={waitingStyle} aria-busy="true">
              <SpinnerIcon size={14} className="animate-spin" />
              Loading subjects…
            </div>
          )}
          {moduleCode && catalogueError && (
            <div role="alert" style={errorBoxStyle}>
              <span>{catalogueError}</span>
              <button type="button" onClick={() => loadCatalogue(moduleCode)} className="mz-tap" style={retryStyle}>
                Try again
              </button>
            </div>
          )}
          {moduleCode && catalogue && subjects.length === 0 && (
            <Waiting>This module has no subjects yet.</Waiting>
          )}
          {moduleCode && catalogue && subjects.length > 0 && (
            <div role="group" aria-labelledby="exam-subjects" className="mz-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {subjects.map((s) => {
                const selected = subjectIds.includes(s.id);
                const empty = s.publishedCount === 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    disabled={empty}
                    onClick={() => toggleSubject(s.id)}
                    className="mz-tap"
                    style={{ ...tileStyle(selected, empty), display: 'flex', alignItems: 'flex-start', gap: 12 }}
                  >
                    <Box checked={selected} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
                        {s.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>
                        {empty
                          ? 'No published questions yet'
                          : `${plural(s.chapters.filter((c) => c.publishedCount > 0).length, 'chapter')} · ${plural(s.publishedCount, 'question')}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3 — Chapters */}
        <Section
          id="exam-chapters"
          title="3. Chapters"
          hint="Choose the chapters to draw questions from."
          actions={
            subjectIds.length > 0 ? (
              <SelectionActions
                selected={chapterIds.length}
                total={selectableChapterIds.length}
                allLabel="Select all chapters"
                onAll={() => commitSelection(subjectIds, selectableChapterIds)}
                onClear={() => commitSelection(subjectIds, [])}
              />
            ) : null
          }
        >
          {subjectIds.length === 0 && (
            <Waiting>{moduleCode ? 'Choose at least one subject first.' : 'Choose a module and a subject first.'}</Waiting>
          )}
          {subjectIds.length > 0 && (
            <div role="group" aria-labelledby="exam-chapters" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {subjects
                .filter((s) => subjectIds.includes(s.id))
                .map((s) => (
                  <div key={s.id}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
                      {s.name}
                    </div>
                    {s.chapters.length === 0 ? (
                      <Waiting>No chapters in this subject yet.</Waiting>
                    ) : (
                      <div className="mz-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {s.chapters.map((c) => {
                          const selected = chapterIds.includes(c.id);
                          const empty = c.publishedCount === 0;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              role="checkbox"
                              aria-checked={selected}
                              disabled={empty}
                              onClick={() => toggleChapter(c.id)}
                              className="mz-tap"
                              style={{
                                ...tileStyle(selected, empty),
                                padding: '12px 14px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 12,
                              }}
                            >
                              <Box checked={selected} />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                                  {c.name}
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                                  {empty ? 'No questions yet' : plural(c.publishedCount, 'question')}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </Section>

        {/* 4 — Number of questions */}
        <Section id="exam-count" title="4. Number of questions" hint="How long should the exam be?">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                borderRadius: 12,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                overflow: 'hidden',
                opacity: max === 0 ? 0.55 : 1,
              }}
            >
              <button
                type="button"
                aria-label="Fewer questions"
                disabled={max === 0 || effectiveCount <= 1}
                onClick={() => setCount(effectiveCount - 1)}
                style={stepperStyle}
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                aria-label="Number of questions"
                aria-describedby="exam-max"
                value={shown}
                placeholder="—"
                disabled={max === 0}
                onChange={(e) => onCountChange(e.target.value)}
                onBlur={() => setDraft(null)}
                style={{
                  width: 76,
                  textAlign: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--text)',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid var(--line)',
                  borderRight: '1px solid var(--line)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <button
                type="button"
                aria-label="More questions"
                disabled={max === 0 || effectiveCount >= max}
                onClick={() => setCount(effectiveCount + 1)}
                style={stepperStyle}
              >
                +
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickCountOptions(max).map((n) => {
                const selected = effectiveCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    aria-pressed={selected}
                    className="mz-chip"
                    style={{
                      padding: '9px 16px',
                      // Same height as the stepper beside it, and a proper touch target.
                      minHeight: 44,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      // Literal: the selected state sits on the solid accent fill.
                      color: selected ? '#F7F9FA' : 'var(--text3)',
                      background: selected ? 'var(--accent-text)' : 'var(--surface)',
                      border: selected ? '1px solid transparent' : '1px solid var(--line)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {n === max && n !== 10 && n !== 20 && n !== 30 && n !== 50 ? `All ${n}` : n}
                  </button>
                );
              })}
            </div>
          </div>

          <p id="exam-max" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
            {max > 0 ? (
              <>
                Maximum available for this selection:{' '}
                <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{max}</strong>{' '}
                {max === 1 ? 'question' : 'questions'}
              </>
            ) : (
              'Choose at least one chapter to see how many questions are available.'
            )}
          </p>
          {capped && max > 0 && (
            <p role="status" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--accent-text)' }}>
              Capped at {max} — that&apos;s all that&apos;s available for this selection.
            </p>
          )}
        </Section>

        {/* Generate */}
        <div
          className="mz-exam-bar"
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            padding: '20px 22px',
            borderRadius: 16,
            background: 'var(--line2)',
            border: '1px solid var(--line2)',
          }}
        >
          {confirmReplace && active ? (
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Replace unfinished exam?
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>
                  Starting a new exam discards your unfinished one ({active.answered} of {active.total} answered).
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setConfirmReplace(false)}
                  disabled={generating}
                  className="mz-tap"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    background: 'transparent',
                    border: '1px solid var(--text3)',
                    padding: '12px 20px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  className="mz-exam-gen"
                  style={generateButtonStyle(!generating)}
                >
                  {generating ? 'Creating…' : 'Replace and start'}
                  {!generating && <ArrowRightIcon size={15} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {canGenerate ? 'Ready' : 'Your exam'}
                </div>
                <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 700, marginTop: 4, overflowWrap: 'anywhere' }}>
                  {summary}
                </div>
              </div>
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate || generating}
                className="mz-exam-gen"
                style={generateButtonStyle(canGenerate && !generating)}
              >
                {generating ? 'Creating…' : 'Generate Exam'}
                {!generating && <ArrowRightIcon size={15} />}
              </button>
            </>
          )}
        </div>
        {generateError && (
          <div role="alert" style={{ ...errorBoxStyle, marginTop: 14 }}>
            <span>{generateError}</span>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  hint,
  actions,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px 16px' }}>
        <div>
          <h2 id={id} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {title}
          </h2>
          {hint && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** "3 of 5 selected · Select all · Clear" */
function SelectionActions({
  selected,
  total,
  allLabel,
  onAll,
  onClear,
}: {
  selected: number;
  total: number;
  allLabel: string;
  onAll: () => void;
  onClear: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px' }}>
      <span aria-live="polite" style={{ fontSize: 12, color: 'var(--text3)' }}>
        {selected} of {total} selected
      </span>
      <button
        type="button"
        onClick={onAll}
        disabled={total === 0 || selected === total}
        className="mz-tap"
        aria-label={allLabel}
        style={textActionStyle(total === 0 || selected === total)}
      >
        Select all
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={selected === 0}
        className="mz-tap"
        style={textActionStyle(selected === 0)}
      >
        Clear
      </button>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <div style={waitingStyle}>{children}</div>;
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        flex: 'none',
        width: 18,
        height: 18,
        marginTop: 1,
        borderRadius: 5,
        display: 'grid',
        placeItems: 'center',
        // Literal: the tick sits on the solid accent fill.
        color: '#F7F9FA',
        background: checked ? 'var(--accent-text)' : 'transparent',
        border: checked ? '1px solid var(--accent-text)' : '1px solid var(--text3)',
      }}
    >
      {checked && <CheckIcon size={12} />}
    </span>
  );
}

function tileStyle(selected: boolean, disabled: boolean): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: 12,
    background: selected ? 'var(--fill)' : 'var(--surface)',
    border: selected ? '1px solid var(--accent-text)' : '1px solid var(--line)',
    color: 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    fontFamily: 'inherit',
    minWidth: 0,
  };
}

function textActionStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    color: disabled ? 'var(--text3)' : 'var(--accent-text)',
    background: 'transparent',
    border: 'none',
    padding: '6px 2px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontFamily: 'inherit',
  };
}

function generateButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 15,
    fontWeight: 700,
    // White stays literal: this button's fill is the solid accent (or a
    // solid muted fallback when disabled), not a neutral surface.
    color: '#F7F9FA',
    background: enabled ? 'var(--accent-text)' : 'var(--text3)',
    padding: '14px 26px',
    borderRadius: 12,
    cursor: enabled ? 'pointer' : 'not-allowed',
    border: 'none',
    fontFamily: 'inherit',
  };
}

const codeBadgeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace,Menlo,monospace',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: 'var(--accent-text)',
  background: 'var(--line2)',
  border: '1px solid var(--line2)',
  padding: '4px 8px',
  borderRadius: 6,
};

const soonBadgeStyle: React.CSSProperties = {
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
};

const stepperStyle: React.CSSProperties = {
  width: 46,
  minHeight: 46,
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1,
  color: 'var(--text)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const waitingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '16px 18px',
  borderRadius: 12,
  background: 'var(--fill)',
  border: '1px solid var(--line)',
  color: 'var(--text3)',
  fontSize: 13,
};

const errorBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 12,
  fontSize: 13,
  color: 'var(--error)',
  background: 'rgb(var(--error-rgb) / 0.08)',
  border: '1px solid rgb(var(--error-rgb) / 0.35)',
};

const retryStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--error)',
  background: 'transparent',
  border: '1px solid rgb(var(--error-rgb) / 0.45)',
  padding: '7px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
