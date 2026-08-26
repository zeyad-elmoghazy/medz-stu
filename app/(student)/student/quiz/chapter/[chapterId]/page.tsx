'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2, Check, X, LogOut, Maximize2, Bookmark, BookmarkCheck, StickyNote } from 'lucide-react';
import { CatalogueShell } from '@/components/catalogue/CatalogueShell';
import { CatalogueBreadcrumb } from '@/components/catalogue/CatalogueBreadcrumb';
import {
  fetchChapterQuiz,
  fetchChapterReferenceImage,
  fetchBookmarkStatus,
  addBookmark,
  removeBookmark,
  fetchNote,
  saveNote,
  type ChapterQuiz,
} from '@/lib/chapter-quiz-api';

// Same lazy-load reasoning as the static quiz page: the editor's UI
// deps aren't paid for on initial quiz load, only when opened.
const NotesEditor = dynamic(() => import('@/components/quiz/NotesEditor'), { ssr: false });

/**
 * Chapter-scoped quiz — reads live from the DB-backed
 * /api/student/chapters/[chapterId]/questions endpoint. A new,
 * parallel path: does not touch /student/quiz/[subjectId] (the
 * static Histology engine) or any of its entry points.
 */
export default function ChapterQuizPage() {
  const params = useParams<{ chapterId: string }>();
  const { chapterId } = params;
  const router = useRouter();

  const [data, setData] = useState<ChapterQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceImageLoading, setReferenceImageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'explanation' | 'reference'>('explanation');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  // Distinguishes a deliberate exit (Exit link, or submitting an
  // answer) from Escape/tab-away in the fullscreenchange handler —
  // same flag name/purpose as the static quiz page's mechanism.
  const intentionalExitRef = useRef(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [noteContent, setNoteContent] = useState('');

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

  useEffect(() => {
    if (!question) return;
    let cancelled = false;
    fetchBookmarkStatus(question.id).then((b) => {
      if (!cancelled) setBookmarked(b);
    });
    return () => {
      cancelled = true;
    };
  }, [question?.id]);

  useEffect(() => {
    if (!question) return;
    let cancelled = false;
    fetchNote(question.id).then((content) => {
      if (!cancelled) setNoteContent(content);
    });
    return () => {
      cancelled = true;
    };
  }, [question?.id]);

  async function toggleBookmark() {
    if (!question || bookmarkLoading) return;
    setBookmarkLoading(true);
    const ok = bookmarked
      ? await removeBookmark(question.id)
      : await addBookmark(question.id);
    if (ok) setBookmarked((b) => !b);
    setBookmarkLoading(false);
  }

  const enterFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    if (!el.requestFullscreen) {
      setFullscreenSupported(false);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser requires a user gesture — the manual "Enter focus
      // mode" button covers this, same fallback as the static quiz.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    intentionalExitRef.current = true;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore — the view already reflects the non-fullscreen state.
    }
  }, []);

  // Re-enters fullscreen before every question's answer phase — not
  // just once at quiz start — mirroring the static page exactly.
  useEffect(() => {
    if (!submitted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      enterFullscreen();
    }
  }, [submitted, index, enterFullscreen]);

  useEffect(() => {
    function onChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) return;

      // Intentional exit (Exit link, or the exitFullscreen() call
      // inside submit()) — nothing further to do.
      if (intentionalExitRef.current) {
        intentionalExitRef.current = false;
      }
      // Unintentional exit (Escape, browser UI, alt-tab): unlike the
      // static Histology challenge, this lightweight practice quiz
      // has no score/streak at stake and is not proctored, so this
      // deliberately does NOT port that page's violation-counting/
      // forced-end behavior — flagged in the PR description, not
      // silently dropped.
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function submit() {
    if (!selectedChoice || submitted || !question) return;
    setSubmitted(true);
    if (isCorrect) setCorrectCount((n) => n + 1);
    exitFullscreen();

    if (question.referencePage != null) {
      setReferenceImageLoading(true);
      fetchChapterReferenceImage(chapterId, question.referencePage)
        .then(setReferenceImageUrl)
        .finally(() => setReferenceImageLoading(false));
    }
  }

  function handleExitClick() {
    intentionalExitRef.current = true;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    router.push('/student/catalogue');
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
    setReferenceImageUrl(null);
    setReferenceImageLoading(false);
    setActiveTab('explanation');
  }

  return (
    <CatalogueShell>
      {/* Mirrors the static quiz page's post-answer grid
          (grid-cols-1 lg:grid-cols-[3fr_2fr]) — single column until
          the same 1024px breakpoint, explanation left / reference
          right beyond it. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.chapter-quiz-split{display:grid;grid-template-columns:1fr;gap:14px}@media (min-width:1024px){.chapter-quiz-split{grid-template-columns:3fr 2fr}}`,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <CatalogueBreadcrumb
          crumbs={[
            { label: 'Home', href: '/student/catalogue' },
            { label: `Module ${data?.moduleCode ?? ''}` },
            { label: data?.subjectName ?? '' },
            { label: data?.chapterName ?? 'Quiz' },
          ]}
        />
        {/* Nothing on this route persists (no DB write, no
            localStorage) — a plain exit, not a save-and-exit modal,
            since there's nothing to save. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!isFullscreen && fullscreenSupported && !submitted && (
            <button
              type="button"
              onClick={() => enterFullscreen()}
              title="Enter focus mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#8B98A6',
                background: 'transparent',
                border: 'none',
                padding: '4px 0',
                cursor: 'pointer',
              }}
            >
              <Maximize2 style={{ width: 13, height: 13 }} />
              Focus mode
            </button>
          )}
          <button
            type="button"
            onClick={handleExitClick}
            title="Exit the quiz"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: '#8B98A6',
              background: 'transparent',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
            }}
          >
            <LogOut style={{ width: 13, height: 13 }} />
            Exit
          </button>
        </div>
      </div>

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

      {data && data.questions.length > 0 && !finished && question && (() => {
        const hasReferenceContent =
          Boolean(question.reference) || referenceImageLoading || referenceImageUrl !== null;

        const questionCard = (
          <div
            style={{
              borderRadius: 20,
              padding: '26px 28px',
              background: 'linear-gradient(135deg,#132B45,#0B1F33)',
              border: '1px solid rgba(0,166,166,0.4)',
              boxShadow: '0 0 40px rgba(0,166,166,0.14)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#F7F9FA', lineHeight: 1.5 }}>
                {question.question}
              </h1>
              <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                <button
                  type="button"
                  onClick={() => setShowNotesPanel(true)}
                  title="Open notes"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: noteContent ? 'rgba(0,166,166,0.15)' : 'transparent',
                    color: noteContent ? '#33BFBF' : '#8B98A6',
                    cursor: 'pointer',
                  }}
                >
                  <StickyNote style={{ width: 14, height: 14 }} />
                </button>
                <button
                  type="button"
                  onClick={toggleBookmark}
                  disabled={bookmarkLoading}
                  title={bookmarked ? 'Remove bookmark' : 'Bookmark this question'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: bookmarked ? 'rgba(0,166,166,0.15)' : 'transparent',
                    color: bookmarked ? '#33BFBF' : '#8B98A6',
                    cursor: bookmarkLoading ? 'default' : 'pointer',
                  }}
                >
                  {bookmarkLoading ? (
                    <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  ) : bookmarked ? (
                    <BookmarkCheck style={{ width: 14, height: 14 }} />
                  ) : (
                    <Bookmark style={{ width: 14, height: 14 }} />
                  )}
                </button>
              </div>
            </div>

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
        );

        if (!submitted) {
          return (
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div style={{ fontSize: 12, color: '#8B98A6', marginBottom: 16 }}>
                Question {index + 1} of {data.questions.length}
              </div>
              {questionCard}
            </div>
          );
        }

        return (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: '#8B98A6', marginBottom: 16 }}>
              Question {index + 1} of {data.questions.length}
            </div>
            <div className="chapter-quiz-split">
              {questionCard}
              <div
                style={{
                  borderRadius: 20,
                  padding: '22px 24px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {hasReferenceContent && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                    <TabButton active={activeTab === 'explanation'} onClick={() => setActiveTab('explanation')}>
                      Explanation
                    </TabButton>
                    <TabButton active={activeTab === 'reference'} onClick={() => setActiveTab('reference')}>
                      Reference
                    </TabButton>
                  </div>
                )}

                {(!hasReferenceContent || activeTab === 'explanation') && (
                  <div>
                    <div style={{ fontSize: 13, color: '#D9F3F0', lineHeight: 1.6 }}>
                      {question.explanation}
                    </div>
                    {question.choiceRationales && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                        {question.choices.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: c.id === question.correctAnswer ? '#6EE7B7' : '#8B98A6',
                            }}
                          >
                            <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{c.id}.</span>{' '}
                            {question.choiceRationales?.[c.id]}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {hasReferenceContent && activeTab === 'reference' && (
                  <div>
                    {question.reference && (
                      <div style={{ fontSize: 12, color: '#8B98A6', marginBottom: referenceImageUrl || referenceImageLoading ? 12 : 0 }}>
                        {question.reference}
                      </div>
                    )}
                    {referenceImageLoading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8B98A6' }}>
                        <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                        Loading reference image…
                      </div>
                    )}
                    {referenceImageUrl && (
                      <div
                        style={{
                          overflow: 'hidden',
                          borderRadius: 9,
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {/* Plain <img> — bucket URLs aren't in next/image's remotePatterns. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={referenceImageUrl}
                          alt="Source page from the module reference book"
                          style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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

      {showNotesPanel && question && (
        <>
          <div
            onClick={() => setShowNotesPanel(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(2px)',
            }}
          />
          <NotesEditor
            // Remounts on question change instead of resetting via an
            // effect, same reasoning as the static quiz page — a
            // pending debounced save flushes through the unmount
            // cleanup rather than being silently discarded.
            key={question.id}
            topic={question.topic}
            initialValue={noteContent}
            onChange={(value) => saveNote(question.id, value)}
            onClose={() => setShowNotesPanel(false)}
          />
        </>
      )}
    </CatalogueShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: active ? '#F7F9FA' : '#8B98A6',
        background: active ? 'rgba(0,166,166,0.15)' : 'transparent',
        border: `1px solid ${active ? 'rgba(0,166,166,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
