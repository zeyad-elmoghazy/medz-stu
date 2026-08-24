'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X } from 'lucide-react';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import { fetchChapterQuiz, type ChapterQuiz } from '@/lib/chapter-quiz-api';

/**
 * Chapter-scoped quiz — reads live from the DB-backed
 * /api/student/chapters/[chapterId]/questions endpoint. A new,
 * parallel path: does not touch /student/quiz/[subjectId] (the
 * static Histology engine) or any of its entry points.
 */
export default function ChapterQuizPage() {
  const params = useParams<{ chapterId: string }>();
  const { chapterId } = params;

  const [data, setData] = useState<ChapterQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchChapterQuiz(chapterId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const question = data?.questions[index] ?? null;
  const isCorrect = useMemo(
    () => !!question && selectedChoice === question.correctAnswer,
    [question, selectedChoice]
  );

  function submit() {
    if (!selectedChoice || submitted) return;
    setSubmitted(true);
    if (isCorrect) setCorrectCount((n) => n + 1);
  }

  function next() {
    if (!data) return;
    if (index + 1 >= data.questions.length) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelectedChoice(null);
    setSubmitted(false);
  }

  return (
    <CatalogueShell>
      <CatalogueBreadcrumb
        crumbs={[
          { label: 'Home', href: '/student/catalogue' },
          { label: `Module ${data?.moduleCode ?? ''}` },
          { label: data?.subjectName ?? '' },
          { label: data?.chapterName ?? 'Quiz' },
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
          Loading quiz…
        </div>
      )}

      {data && data.questions.length === 0 && (
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
          No published questions in this chapter yet.
        </div>
      )}

      {data && data.questions.length > 0 && !finished && question && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 12, color: '#8B98A6', marginBottom: 16 }}>
            Question {index + 1} of {data.questions.length}
          </div>

          <div
            style={{
              borderRadius: 20,
              padding: '26px 28px',
              background: 'linear-gradient(135deg,#132B45,#0B1F33)',
              border: '1px solid rgba(0,166,166,0.4)',
              boxShadow: '0 0 40px rgba(0,166,166,0.14)',
            }}
          >
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#F7F9FA', lineHeight: 1.5 }}>
              {question.question}
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              {question.choices.map((c) => {
                const isSelected = selectedChoice === c.id;
                const isRightAnswer = c.id === question.correctAnswer;
                let borderColor = 'rgba(255,255,255,0.1)';
                let background = 'rgba(255,255,255,0.03)';
                if (submitted && isRightAnswer) {
                  borderColor = 'rgba(16,185,129,0.6)';
                  background = 'rgba(16,185,129,0.12)';
                } else if (submitted && isSelected && !isRightAnswer) {
                  borderColor = 'rgba(239,68,68,0.6)';
                  background = 'rgba(239,68,68,0.12)';
                } else if (isSelected) {
                  borderColor = 'rgba(0,166,166,0.5)';
                  background = 'rgba(0,166,166,0.1)';
                }
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => !submitted && setSelectedChoice(c.id)}
                    disabled={submitted}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      textAlign: 'left',
                      fontSize: 14,
                      color: '#F7F9FA',
                      background,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 11,
                      padding: '13px 16px',
                      cursor: submitted ? 'default' : 'pointer',
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#8B98A6',
                      }}
                    >
                      {submitted && isRightAnswer ? (
                        <Check style={{ width: 13, height: 13, color: '#10B981' }} />
                      ) : submitted && isSelected && !isRightAnswer ? (
                        <X style={{ width: 13, height: 13, color: '#EF4444' }} />
                      ) : (
                        c.id
                      )}
                    </span>
                    {c.text}
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div
                style={{
                  marginTop: 18,
                  padding: '14px 16px',
                  borderRadius: 11,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13,
                  color: '#D9F3F0',
                  lineHeight: 1.6,
                }}
              >
                {question.explanation}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
              {!submitted ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!selectedChoice}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#F7F9FA',
                    background: selectedChoice
                      ? 'linear-gradient(135deg,#00A6A6,#33BFBF)'
                      : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 22px',
                    cursor: selectedChoice ? 'pointer' : 'not-allowed',
                  }}
                >
                  Submit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#F7F9FA',
                    background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 22px',
                    cursor: 'pointer',
                  }}
                >
                  {index + 1 >= data.questions.length ? 'Finish' : 'Next question'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {data && finished && (
        <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#00A6A6', textTransform: 'uppercase' }}>
            Quiz complete
          </div>
          <h1 style={{ margin: '14px 0 0', fontSize: 34, fontWeight: 900, color: '#F7F9FA' }}>
            {correctCount} / {data.questions.length}
          </h1>
          <p style={{ margin: '10px 0 26px', fontSize: 13, color: '#8B98A6' }}>{data.chapterName}</p>
          <Link
            href="/student/catalogue"
            style={{
              display: 'inline-block',
              fontSize: 13,
              fontWeight: 700,
              color: '#F7F9FA',
              background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
              padding: '11px 24px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            Back to Catalogue
          </Link>
        </div>
      )}
    </CatalogueShell>
  );
}
