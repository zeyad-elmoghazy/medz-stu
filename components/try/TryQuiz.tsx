'use client';

import Link from 'next/link';
import { useState } from 'react';
import { letterFor } from '@/lib/utils';
import type { TryQuestion } from '@/lib/server/try-questions';

/**
 * The public /try quiz: answer a few real questions with no account, see the
 * verdict and explanation after each one, then a score and a prompt to sign
 * up. Everything is local state: nothing is stored, no cookies are set.
 * The questions arrive WITHOUT answers; each check goes to POST /api/try/check.
 */

type Verdict = { isCorrect: boolean; correctAnswer: string; explanation: string };

const SIGNUP_HREF = '/signup?utm_source=try&utm_medium=web&utm_campaign=try-page';

export function TryQuiz({ questions }: { questions: TryQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const total = questions.length;
  const question = questions[index];

  async function check() {
    if (!picked || verdict || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/try/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, choice: picked }),
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
      if (v.isCorrect) setScore((s) => s + 1);
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
    setIndex((i) => i + 1);
    setPicked(null);
    setVerdict(null);
    setError(null);
  }

  if (finished) {
    return (
      <section style={cardStyle} aria-live="polite">
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
              <span style={{ flex: 1 }}>{c.text}</span>
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
          {verdict.explanation && (
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text2)', marginTop: 6 }}>
              {verdict.explanation}
            </p>
          )}
          <button type="button" onClick={next} style={{ ...primaryButtonStyle, marginTop: 18, border: 0 }}>
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
  );
}

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
