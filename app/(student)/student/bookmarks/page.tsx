'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { isDemoMode } from '@/lib/supabase';
import { removeBookmark } from '@/lib/chapter-quiz-api';

type Choice = { id: string; text: string };

type QuestionDetailFields = {
  choices: Choice[];
  correctAnswer: string | null;
  explanation: string;
  choiceRationales: Record<string, string> | null;
};

type BookmarkItem = QuestionDetailFields & {
  id: string;
  questionId: number;
  question: string;
  topic: string;
  chapterName: string | null;
  moduleCode: string | null;
  createdAt: string;
};

type NoteItem = QuestionDetailFields & {
  id: string;
  questionId: number;
  question: string;
  topic: string;
  chapterName: string | null;
  moduleCode: string | null;
  content: string;
  updatedAt: string;
};

/**
 * /student/bookmarks — lists everything a student has bookmarked or
 * annotated via the chapter-quiz flow (app/api/student/bookmarks,
 * app/api/student/notes, list mode). Deliberately does not attempt
 * to surface the legacy [subjectId] quiz's bookmarks/notes — those
 * are pure localStorage state against questions that don't exist in
 * the `questions` table, so there is nothing real to show for them
 * (see the plan's investigation of data/histology-questions.ts).
 *
 * Each row can be opened to reveal the question's choices, the
 * correct answer, and its explanation — a read-only review, not a
 * retry (retrying happens via the chapter itself), since these
 * items span potentially many different chapters/subjects.
 */
export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[] | null>(null);
  const [notes, setNotes] = useState<NoteItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openBookmarkId, setOpenBookmarkId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Demo mode has no real Supabase session — the API would 401.
      // Matches the short-circuit pattern used elsewhere (e.g.
      // dashboard/page.tsx, leaderboard/page.tsx).
      if (isDemoMode()) {
        if (!cancelled) {
          setBookmarks([]);
          setNotes([]);
          setLoading(false);
        }
        return;
      }
      try {
        const [bookmarksRes, notesRes] = await Promise.all([
          fetch('/api/student/bookmarks', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/student/notes', { credentials: 'include', cache: 'no-store' }),
        ]);
        if (!bookmarksRes.ok || !notesRes.ok) {
          throw new Error('Failed to load bookmarks/notes');
        }
        const bookmarksJson = (await bookmarksRes.json()) as { bookmarks: BookmarkItem[] };
        const notesJson = (await notesRes.json()) as { notes: NoteItem[] };
        if (!cancelled) {
          setBookmarks(bookmarksJson.bookmarks);
          setNotes(notesJson.notes);
        }
      } catch {
        if (!cancelled) setError('Could not load your bookmarks and notes right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemoveBookmark(questionId: number) {
    const ok = await removeBookmark(questionId);
    if (ok) {
      setBookmarks((prev) => (prev ? prev.filter((b) => b.questionId !== questionId) : prev));
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0B1F33', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <StudentNavbar activeLabel="Bookmarks" />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '44px 34px 80px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#33BFBF' }}>
          Saved
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#F7F9FA', margin: '6px 0 4px' }}>
          Bookmarks &amp; Notes
        </h1>
        <p style={{ fontSize: 13, color: '#8B98A6', margin: 0 }}>
          Questions you&apos;ve saved and notes you&apos;ve written while practicing chapters. Tap a
          question to open it.
          {isDemoMode() ? ' (demo mode has no saved items)' : ''}
        </p>

        {error && (
          <div style={{ marginTop: 24, fontSize: 12, color: '#EF4444' }}>{error}</div>
        )}

        <Section
          title="Bookmarked Questions"
          count={bookmarks?.length ?? 0}
          loading={loading}
          emptyLabel="No bookmarked questions yet — tap the bookmark icon while taking a chapter quiz to save one here."
        >
          {(bookmarks ?? []).map((b) => {
            const open = openBookmarkId === b.id;
            return (
              <Row key={b.id}>
                <RowHeader open={open} onToggle={() => setOpenBookmarkId(open ? null : b.id)}>
                  <RowBody
                    topic={b.topic}
                    question={b.question}
                    chapterName={b.chapterName}
                    moduleCode={b.moduleCode}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBookmark(b.questionId);
                    }}
                    style={removeButtonStyle}
                  >
                    Remove
                  </button>
                </RowHeader>
                {open && <QuestionDetail {...b} />}
              </Row>
            );
          })}
        </Section>

        <Section
          title="My Notes"
          count={notes?.length ?? 0}
          loading={loading}
          emptyLabel="No notes yet — open the notes panel while taking a chapter quiz to write one."
        >
          {(notes ?? []).map((n) => {
            const open = openNoteId === n.id;
            return (
              <Row key={n.id}>
                <RowHeader open={open} onToggle={() => setOpenNoteId(open ? null : n.id)}>
                  <RowBody
                    topic={n.topic}
                    question={n.question}
                    chapterName={n.chapterName}
                    moduleCode={n.moduleCode}
                  />
                </RowHeader>
                <p style={{ fontSize: 12.5, color: '#F7F9FA', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {n.content.length > 220 ? `${n.content.slice(0, 220)}…` : n.content}
                </p>
                {open && <QuestionDetail {...n} />}
              </Row>
            );
          })}
        </Section>
      </div>
    </main>
  );
}

const removeButtonStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#8B98A6',
  background: 'transparent',
  border: '1px solid #132B45',
  borderRadius: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  flex: 'none' as const,
};

function Section({
  title,
  count,
  loading,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F7F9FA', margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: '#8B98A6' }}>{loading ? '' : count}</span>
      </div>
      <div
        style={{
          marginTop: 14,
          background: '#132B45',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          padding: loading || count === 0 ? '24px' : '8px 20px',
        }}
      >
        {loading ? (
          <div style={{ fontSize: 12, color: '#8B98A6' }}>Loading…</div>
        ) : count === 0 ? (
          <div style={{ fontSize: 12, color: '#8B98A6', lineHeight: 1.5 }}>{emptyLabel}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
        )}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {children}
    </div>
  );
}

function RowHeader({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onToggle();
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        cursor: 'pointer',
      }}
    >
      {children}
      <span style={{ flex: 'none', color: '#8B98A6', marginTop: 2 }}>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </span>
    </div>
  );
}

function RowBody({
  topic,
  question,
  chapterName,
  moduleCode,
}: {
  topic: string;
  question: string;
  chapterName: string | null;
  moduleCode: string | null;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#33BFBF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {topic}
        {chapterName && (
          <span style={{ color: '#8B98A6' }}>
            {' '}
            · {chapterName}
            {moduleCode ? ` (${moduleCode})` : ''}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13.5, color: '#F7F9FA', margin: '4px 0 0', lineHeight: 1.5 }}>{question}</p>
    </div>
  );
}

/** Read-only choices + correct answer + explanation for one question — opened from either section. */
function QuestionDetail({ choices, correctAnswer, explanation, choiceRationales }: QuestionDetailFields) {
  if (choices.length === 0) {
    return (
      <div style={{ marginTop: 12, fontSize: 12, color: '#8B98A6' }}>
        This question is no longer available.
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {choices.map((c) => {
          const isCorrect = c.id === correctAnswer;
          return (
            <div
              key={c.id}
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 12.5,
                padding: '8px 10px',
                borderRadius: 8,
                background: isCorrect ? 'rgba(16,185,129,0.1)' : 'transparent',
                border: isCorrect ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                color: isCorrect ? '#6EE7B7' : '#F7F9FA',
              }}
            >
              <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{c.id}</span>
              <span style={{ flex: 1 }}>
                {c.text}
                {choiceRationales?.[c.id] && (
                  <span style={{ display: 'block', color: '#8B98A6', marginTop: 2 }}>
                    {choiceRationales[c.id]}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {explanation && (
        <p style={{ fontSize: 12, color: '#8B98A6', marginTop: 12, lineHeight: 1.6 }}>{explanation}</p>
      )}
    </div>
  );
}
