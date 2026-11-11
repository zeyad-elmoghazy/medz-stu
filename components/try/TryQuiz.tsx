'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageZoomViewer } from '@/components/quiz/ImageZoomViewer';
import { ZoomInIcon } from '@/components/icons';
import { letterFor } from '@/lib/utils';
import type { TryChoice, TryQuestion, TryReveal } from '@/lib/server/try-questions';

/**
 * The public /try quiz: pick your academic year, answer that year's sample of
 * real questions with no account, and the moment an answer is checked see what
 * the student quiz shows: the verdict, a rationale under every choice, an
 * Explanation tab (key concept, why, choice-by-choice, take-away) and a
 * Reference tab (the book page). Then a score and a prompt to sign up.
 * Everything is local state: nothing is stored, no cookies are set. The
 * questions arrive WITHOUT answers; each check goes to POST /api/try/check and
 * the page image to GET /api/try/reference-image.
 */

export type TryYear = { year: number; moduleName: string; questions: TryQuestion[] };

type Verdict = { isCorrect: boolean } & TryReveal;
type Tab = 'explanation' | 'reference';
/** The book-page image for the current question, once it has been answered. */
type ImageState = { qid: number; url: string | null; loading: boolean };

const SIGNUP_HREF = '/signup?utm_source=try&utm_medium=web&utm_campaign=try-page';

// Split view on wide screens, stacked on phones (the hint only makes sense beside the question).
const LAYOUT_CSS = `
  .mz-try-split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
  .mz-try-hint { display: none; }
  .mz-try-next-bottom { display: block; }
  @media (min-width: 960px) {
    .mz-try-split { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
    .mz-try-hint { display: block; }
    .mz-try-next-bottom { display: none; }
  }
`;

export function TryQuiz({ years }: { years: TryYear[] }) {
  const [year, setYear] = useState(years[0].year);
  const selected = years.find((y) => y.year === year) ?? years[0];

  return (
    <div>
      <style>{LAYOUT_CSS}</style>
      {years.length > 1 && (
        <div role="group" aria-label="Choose your year" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {years.map((y) => {
            const active = y.year === selected.year;
            return (
              <button
                key={y.year}
                type="button"
                aria-pressed={active}
                onClick={() => setYear(y.year)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 11,
                  border: `1px solid ${active ? 'var(--accent-text)' : 'var(--line2)'}`,
                  background: active ? 'var(--accent-text)' : 'var(--surface)',
                  color: active ? '#F7F9FA' : 'var(--text)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Year {y.year}
              </button>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 13.5, color: 'var(--text3)', margin: '0 0 12px' }}>
        {selected.questions.length} questions from {selected.moduleName}
      </p>
      {/* Keyed by year: picking another year starts that quiz from scratch. */}
      <YearQuiz key={selected.year} year={selected.year} questions={selected.questions} />
    </div>
  );
}

function YearQuiz({ year, questions }: { year: number; questions: TryQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [tab, setTab] = useState<Tab>('explanation');
  const [image, setImage] = useState<ImageState | null>(null);

  const total = questions.length;
  const question = questions[index];
  // The question the page is on, so a slow image for an earlier one is ignored.
  const currentQid = useRef(question.id);
  const panelRef = useRef<HTMLElement>(null);

  // On a phone the explanation sits below the question, out of sight: bring it
  // into view the moment the answer is checked. (Beside the question on wide screens.)
  useEffect(() => {
    if (!verdict || !window.matchMedia('(max-width: 959px)').matches) return;
    // A beat after the commit, once the Check button has been swapped for the verdict.
    // An instant jump (no animation): it works everywhere and needs no reduced-motion branch.
    const id = window.setTimeout(
      () => panelRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }),
      120
    );
    return () => window.clearTimeout(id);
  }, [verdict]);

  async function loadImage(qid: number) {
    setImage({ qid, url: null, loading: true });
    let url: string | null = null;
    try {
      const res = await fetch(`/api/try/reference-image?year=${year}&questionId=${qid}`);
      if (res.ok) url = ((await res.json()) as { url: string | null }).url ?? null;
    } catch {
      /* no image: the reference text still shows */
    }
    if (currentQid.current === qid) setImage({ qid, url, loading: false });
  }

  async function check() {
    if (!picked || verdict || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/try/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, questionId: question.id, choice: picked }),
      });
      if (!res.ok) {
        setError(
          res.status === 429
            ? 'Too many tries from your network. Please wait a moment and try again.'
            : "We couldn't check that answer. Please try again."
        );
        return;
      }
      const v = (await res.json()) as Verdict;
      setVerdict(v);
      setTab('explanation');
      if (v.isCorrect) setScore((s) => s + 1);
      // Fetched right away, so the Reference tab is ready by the time it is opened.
      if (v.referencePage != null) void loadImage(question.id);
    } catch {
      setError("We couldn't check that answer. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (index + 1 >= total) {
      setFinished(true);
      return;
    }
    currentQid.current = questions[index + 1].id;
    setIndex((i) => i + 1);
    setPicked(null);
    setVerdict(null);
    setError(null);
    setImage(null);
    setTab('explanation');
  }

  if (finished) {
    return (
      <section style={{ ...cardStyle, maxWidth: 720 }} aria-live="polite">
        <div style={kickerStyle}>Your score</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>
          {score} / {total}
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text2)', margin: '12px 0 24px' }}>
          That is a taste of it. A free account gives you the full question bank, instant
          explanations, your accuracy over time and a daily study streak.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Link href={SIGNUP_HREF} style={primaryButtonStyle}>
            Create your free account →
          </Link>
          <Link href="/login" style={secondaryButtonStyle}>
            I already have an account
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="mz-try-split">
      <section style={cardStyle}>
        <div style={kickerStyle}>
          Question {index + 1} of {total}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5, margin: '10px 0 20px' }}>
          {question.question}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="group" aria-label="Choices">
          {question.choices.map((c, i) => {
            const selected = picked === c.id;
            const isCorrectChoice = verdict?.correctAnswer === c.id;
            const isWrongPick = !!verdict && selected && !verdict.isCorrect;
            const rationale = verdict?.choiceRationales?.[c.id];
            const border = isCorrectChoice
              ? 'var(--success)'
              : isWrongPick
                ? 'var(--error)'
                : selected
                  ? 'var(--accent-text)'
                  : 'var(--line2)';
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                disabled={!!verdict || checking}
                onClick={() => setPicked(c.id)}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: `1px solid ${border}`,
                  fontSize: 15,
                  lineHeight: 1.5,
                  cursor: verdict || checking ? 'default' : 'pointer',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text3)' }}>{letterFor(i)}</span>
                <span style={{ flex: 1 }}>
                  {c.text}
                  {rationale && (
                    <span style={{ display: 'block', marginTop: 4, fontSize: 13, fontStyle: 'italic', color: 'var(--text3)' }}>
                      {stripPrefix(rationale)}
                    </span>
                  )}
                </span>
                {isCorrectChoice && <span style={{ color: 'var(--success)', fontWeight: 700 }}>Correct</span>}
                {isWrongPick && <span style={{ color: 'var(--error)', fontWeight: 700 }}>Your answer</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--error)', fontSize: 14, marginTop: 14 }}>
            {error}
          </p>
        )}

        {verdict ? (
          <div style={{ marginTop: 20 }} aria-live="polite">
            <p style={{ fontWeight: 700, color: verdict.isCorrect ? 'var(--success)' : 'var(--error)' }}>
              {verdict.isCorrect ? 'Correct!' : 'Not quite.'}
            </p>
            <button type="button" onClick={next} style={{ ...primaryButtonStyle, marginTop: 12, border: 0 }}>
              {index + 1 >= total ? 'See my score →' : 'Next question →'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={check}
            disabled={!picked || checking}
            style={{
              ...primaryButtonStyle,
              marginTop: 20,
              border: 0,
              opacity: !picked || checking ? 0.5 : 1,
              cursor: !picked || checking ? 'not-allowed' : 'pointer',
            }}
          >
            {checking ? 'Checking…' : 'Check answer'}
          </button>
        )}
      </section>

      <aside ref={panelRef}>
        {verdict ? (
          <FeedbackPanel
            choices={question.choices}
            reveal={verdict}
            tab={tab}
            setTab={setTab}
            image={image?.qid === question.id ? image : null}
            onNext={next}
            isLast={index + 1 >= total}
          />
        ) : (
          <div className="mz-try-hint" style={hintStyle}>
            Answer the question to open the explanation, the choice-by-choice breakdown and the
            textbook page.
          </div>
        )}
      </aside>
    </div>
  );
}

function FeedbackPanel({
  choices,
  reveal,
  tab,
  setTab,
  image,
  onNext,
  isLast,
}: {
  choices: TryChoice[];
  reveal: TryReveal;
  tab: Tab;
  setTab: (t: Tab) => void;
  image: ImageState | null;
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      <div role="tablist" aria-label="After you answer" style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--line)' }}>
        {(['explanation', 'reference'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 9,
              border: 0,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tab === t ? 'var(--text)' : 'var(--text3)',
              background: tab === t ? 'rgb(var(--accent-text-rgb) / 0.18)' : 'transparent',
            }}
          >
            {t === 'explanation' ? 'Explanation' : 'Reference'}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ padding: 20 }}>
        {tab === 'explanation' ? (
          <ExplanationTab choices={choices} reveal={reveal} />
        ) : (
          <ReferenceTab reveal={reveal} image={image} />
        )}
        {/* Phones only: the question's own Next button is far above this panel. */}
        <button
          type="button"
          onClick={onNext}
          className="mz-try-next-bottom"
          style={{ ...primaryButtonStyle, marginTop: 20, border: 0, width: '100%', cursor: 'pointer' }}
        >
          {isLast ? 'See my score →' : 'Next question →'}
        </button>
      </div>
    </div>
  );
}

function ExplanationTab({ choices, reveal }: { choices: TryChoice[]; reveal: TryReveal }) {
  // First sentence is the key concept; the rest explain why.
  const sentences = reveal.explanation
    .split(/(?<=[.])\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const summary = sentences[0] ?? reveal.explanation;
  const details = sentences.slice(1);
  const correctChoice = choices.find((c) => c.id === reveal.correctAnswer);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {summary && (
        <section>
          <SectionHeader>Key concept</SectionHeader>
          <p style={bodyTextStyle}>{summary}</p>
        </section>
      )}

      {details.length > 0 && (
        <section>
          <SectionHeader>Why this answer</SectionHeader>
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {details.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, ...bodyTextStyle, margin: 0 }}>
                <span aria-hidden style={{ marginTop: 8, width: 6, height: 6, flex: 'none', borderRadius: 999, background: 'var(--accent-text)' }} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reveal.choiceRationales && (
        <section>
          <SectionHeader>Choice-by-choice</SectionHeader>
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {choices.map((c) => {
              const raw = reveal.choiceRationales?.[c.id];
              if (!raw) return null;
              const ok = c.id === reveal.correctAnswer;
              return (
                <li
                  key={c.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: ok ? 'rgb(var(--success-rgb) / 0.08)' : 'var(--fill)',
                    border: `1px solid ${ok ? 'rgb(var(--success-rgb) / 0.35)' : 'var(--line)'}`,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: ok ? 'var(--success)' : 'var(--error)' }}>
                    {c.id.toUpperCase()} · {ok ? 'Correct' : 'Wrong'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{stripPrefix(raw)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <SectionHeader>Take-away</SectionHeader>
        <div
          style={{
            marginTop: 10,
            padding: 16,
            borderRadius: 12,
            background: 'rgb(var(--accent-text-rgb) / 0.08)',
            border: '1px solid rgb(var(--accent-text-rgb) / 0.25)',
          }}
        >
          {reveal.topic && (
            <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
              Topic · {reveal.topic}
            </p>
          )}
          {correctChoice && (
            <p style={{ ...bodyTextStyle, margin: reveal.topic ? '8px 0 0' : 0 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>Correct answer:</span> {correctChoice.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ReferenceTab({ reveal, image }: { reveal: TryReveal; image: ImageState | null }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const closeZoom = useCallback(() => setZoomOpen(false), []);

  const imageUrl = image?.url ?? null;
  const loading = image?.loading ?? false;
  const text = reveal.reference.trim() || (reveal.referencePage ? `Page ${reveal.referencePage}` : '');

  if (!text && !imageUrl && !loading) {
    return <p style={{ ...bodyTextStyle, margin: 0, color: 'var(--text3)' }}>No book reference for this question.</p>;
  }

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: 'var(--reference-bg)',
        color: 'var(--reference-text)',
        border: '1px solid var(--reference-border)',
      }}
    >
      <div style={{ paddingBottom: 14, borderBottom: '1px dashed var(--reference-border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--reference-accent)' }}>Reference</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--reference-accent)' }}>From the Module Reference Book</div>
      </div>

      {loading && <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--reference-accent)' }}>Loading the book page…</p>}

      {imageUrl && (
        <>
          <button
            ref={zoomTriggerRef}
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Open the book page full screen to zoom"
            style={{
              position: 'relative',
              display: 'block',
              width: '100%',
              marginTop: 16,
              padding: 0,
              overflow: 'hidden',
              borderRadius: 8,
              border: '1px solid var(--reference-border)',
              background: 'var(--reference-bg)',
              cursor: 'zoom-in',
            }}
          >
            {/* Plain <img>: bucket URLs aren't in next/image's remotePatterns (same as the student quiz). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              decoding="async"
              alt="Source page from the module reference book"
              style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain' }}
            />
            <span
              style={{
                position: 'absolute',
                right: 8,
                bottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--surface)',
                color: 'var(--text2)',
                border: '1px solid var(--line)',
                pointerEvents: 'none',
              }}
            >
              <ZoomInIcon size={14} />
              Tap to zoom
            </span>
          </button>
          <ImageZoomViewer
            open={zoomOpen}
            src={imageUrl}
            alt="Source page from the module reference book, enlarged"
            onClose={closeZoom}
            returnFocusRef={zoomTriggerRef}
          />
        </>
      )}

      {text && <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.7, color: 'var(--reference-text)' }}>{text}</p>}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <header style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
      {children}
    </header>
  );
}

/** Rationales are stored as "CORRECT - ..." / "WRONG - ..."; the badge already says which. */
function stripPrefix(raw: string): string {
  return raw.replace(/^\s*(CORRECT|WRONG)\s*[—:-]\s*/i, '').trim();
}

const bodyTextStyle = { margin: '10px 0 0', fontSize: 14, lineHeight: 1.7, color: 'var(--text)' } as const;

const hintStyle = {
  padding: 20,
  borderRadius: 16,
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--text3)',
  background: 'var(--fill)',
  border: '1px dashed var(--line2)',
} as const;

const cardStyle = {
  padding: 24,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
} as const;

const kickerStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--accent-text)',
} as const;

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 20px',
  borderRadius: 11,
  background: 'var(--accent-text)',
  color: '#F7F9FA',
  fontSize: 14,
  fontWeight: 700,
  textDecoration: 'none',
} as const;

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--line2)',
} as const;
