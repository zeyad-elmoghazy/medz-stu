'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RotateCcw, Lock } from 'lucide-react';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import {
  HISTOLOGY_SUBJECT_PREFIX,
  findModule,
  type Chapter,
} from '@/data/histology-catalog';
import {
  useChapterProgress,
  useChapterProgressActions,
  useModuleProgress,
} from '@/lib/chapter-progress';

// =============================================================
// Chapters page — /student/subjects/[subjectId]/[moduleCode]
// Ported from `MedZ Home.dc.html` → `isChapters` section.
// Adds a "Solve Again" button on completed chapters that resets
// stored progress and drops the student back into the quiz.
// =============================================================

const SUPPORTED_SUBJECTS: Record<string, { name: string; prefix: string; quizHref: string }> = {
  histology: {
    name: 'Histology',
    prefix: HISTOLOGY_SUBJECT_PREFIX,
    quizHref: '/student/quiz/histology',
  },
};

const canvasBg: CSSProperties = {
  width: 1280,
  margin: '0 auto',
  position: 'relative',
  overflow: 'hidden',
  background:
    'radial-gradient(900px 520px at 88% -6%, rgba(0,166,166,0.3), transparent 60%),' +
    'radial-gradient(760px 520px at 6% 42%, rgba(88,28,235,0.18), transparent 55%),' +
    '#0B1F33',
  paddingBottom: 2,
};

const dotTexture: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
  backgroundSize: '26px 26px',
  opacity: 0.5,
  pointerEvents: 'none',
};

export default function ModuleChaptersPage() {
  const params = useParams<{ subjectId: string; moduleCode: string }>();
  const subject = SUPPORTED_SUBJECTS[params.subjectId];
  if (!subject) notFound();
  const found = findModule(params.moduleCode);
  if (!found) notFound();
  const { module: m } = found;

  const chapterMeta = useMemo(
    () => m.chapters.map((c) => ({ id: c.id, defaultProgress: c.defaultProgress })),
    [m],
  );
  const progress = useModuleProgress(params.subjectId, m.code, chapterMeta);

  // Live per-chapter published_count + module total. Overlays
  // the (zeroed) static catalog so the moment a professor
  // publishes, this page shows it.
  const [liveModuleQs, setLiveModuleQs] = useState<number | null>(null);
  const [chapterLive, setChapterLive] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/professor/modules', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          modules?: Array<{
            code: string;
            chapters?: Array<{ slug: string; published_count?: number }>;
          }>;
        };
        if (cancelled) return;
        const mod = body.modules?.find((x) => x.code === m.code);
        if (!mod) return;
        const map = new Map<string, number>();
        let total = 0;
        for (const c of mod.chapters ?? []) {
          const n = Number(c.published_count) || 0;
          map.set(c.slug, n);
          total += n;
        }
        setChapterLive(map);
        setLiveModuleQs(total);
      } catch {
        /* stay at 0 */
      }
    }
    load();
    // Re-fetch when the tab regains focus so a professor publish in
    // another tab shows up here without a full reload.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [m.code]);

  // A chapter unlocks the moment its live published_count exceeds 0,
  // regardless of the static catalog flag.
  const isUnlocked = (c: Chapter) => c.published || (chapterLive.get(c.id) ?? 0) > 0;
  const publishedChapters = m.chapters.filter(isUnlocked);
  const publishedCount = publishedChapters.length;
  const doneCount = publishedChapters.filter((c) => (progress[c.id] ?? c.defaultProgress) === 100).length;
  const avgProgress = publishedCount === 0
    ? 0
    : Math.round(
        publishedChapters.reduce((a, c) => a + (progress[c.id] ?? c.defaultProgress), 0) /
          publishedCount,
      );

  return (
    <main style={{ minHeight: '100vh', background: '#0B1F33', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={canvasBg}>
        <div aria-hidden style={dotTexture} />

        <StudentNavbar activeLabel="Subjects" />

        <section style={{ position: 'relative', padding: '34px 44px 56px' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8B98A6', marginBottom: 22 }}>
            <Link href="/student/dashboard" style={{ color: '#8B98A6', textDecoration: 'none' }}>Home</Link>
            <span>›</span>
            <Link href="/student/subjects" style={{ color: '#8B98A6', textDecoration: 'none' }}>Subjects</Link>
            <span>›</span>
            <Link href={`/student/subjects/${params.subjectId}`} style={{ color: '#8B98A6', textDecoration: 'none' }}>
              {subject.name}
            </Link>
            <span>›</span>
            <span style={{ color: '#33BFBF', fontWeight: 600 }}>Module {m.code}</span>
          </div>

          {/* Module header banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
              borderRadius: 20,
              padding: '24px 26px',
              background: 'linear-gradient(135deg,#132B45,#0B1F33)',
              border: '1px solid rgba(0,166,166,0.4)',
              boxShadow: '0 0 40px rgba(0,166,166,0.16)',
              marginBottom: 30,
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: 'ui-monospace,Menlo,monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#33BFBF',
                  background: 'rgba(0,166,166,0.16)',
                  border: '1px solid rgba(0,166,166,0.35)',
                  padding: '5px 10px',
                  borderRadius: 7,
                }}
              >
                {subject.prefix} {m.code}
              </span>
              <h1 style={{ margin: '14px 0 0', fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: '#F7F9FA' }}>
                {m.name}
              </h1>
              <div style={{ fontSize: 12.5, color: '#8B98A6', marginTop: 8 }}>
                {liveModuleQs ?? m.qs} questions · {m.chapters.length} chapters
              </div>
              {publishedCount === 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 14,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#8B98A6',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '5px 10px',
                    borderRadius: 7,
                  }}
                >
                  <Lock style={{ width: 11, height: 11 }} /> Awaiting Content
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', flex: 'none' }}>
              {publishedCount === 0 ? (
                <>
                  <div style={{ fontSize: 34, fontWeight: 900, color: '#8B98A6', letterSpacing: '-0.02em' }}>—</div>
                  <div style={{ fontSize: 10, color: '#8B98A6', marginTop: 2 }}>Module progress</div>
                  <div style={{ fontSize: 10, color: '#8B98A6', marginTop: 8, fontWeight: 700 }}>
                    Locked until publish
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 34, fontWeight: 900, color: '#00A6A6', letterSpacing: '-0.02em' }}>
                    {avgProgress}%
                  </div>
                  <div style={{ fontSize: 10, color: '#8B98A6', marginTop: 2 }}>Module progress</div>
                  <div style={{ fontSize: 10, color: '#10B981', marginTop: 8, fontWeight: 700 }}>
                    {doneCount} / {publishedCount} completed
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#F7F9FA' }}>
              Chapters
            </h2>
            <span style={{ fontSize: 12, color: '#8B98A6' }}>
              Track your progress through each chapter
            </span>
          </div>

          {/* Chapter list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {m.chapters.map((c, i) => (
              <ChapterRow
                key={c.id}
                subjectId={params.subjectId}
                moduleCode={m.code}
                chapter={c}
                index={i}
                quizHref={subject.quizHref}
                publishedCount={chapterLive.get(c.id) ?? 0}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// =============================================================
// Chapter row — the whole row navigates into the quiz, with the
// Solve Again button preempting that click when the chapter is
// already at 100%.
// =============================================================

function ChapterRow({
  subjectId,
  moduleCode,
  chapter: c,
  index,
  quizHref,
  publishedCount,
}: {
  subjectId: string;
  moduleCode: string;
  chapter: Chapter;
  index: number;
  quizHref: string;
  publishedCount: number;
}) {
  const router = useRouter();
  const prog = useChapterProgress(subjectId, moduleCode, c.id, c.defaultProgress);
  const { reset } = useChapterProgressActions(subjectId, moduleCode);

  // A live published_count > 0 unlocks the chapter even if the static
  // catalog still has it as unpublished (professor just published).
  const locked = !c.published && publishedCount === 0;
  const done = !locked && prog === 100;
  const started = !locked && prog > 0 && prog < 100;

  const barColor = locked ? '#1E293B' : done ? '#10B981' : started ? '#33BFBF' : '#334155';
  const pctColor = locked ? '#475569' : done ? '#10B981' : started ? '#33BFBF' : '#64748B';
  const statusText = locked ? 'Locked' : done ? 'Completed' : started ? 'In Progress' : 'Not started';
  const statusStyle: CSSProperties = locked
    ? { color: '#94A3B8', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
    : done
      ? { color: '#10B981', background: 'rgba(16,185,129,0.12)' }
      : started
        ? { color: '#33BFBF', background: 'rgba(0,166,166,0.16)' }
        : { color: '#8B98A6', background: 'rgba(255,255,255,0.05)' };

  const openQuiz = () => {
    // Chapter-scoped quizzes aren't wired at the data layer yet;
    // the quiz page hosts the full Histology bank. Passing the
    // module/chapter as query params gives us a hook to filter on
    // later without breaking today's flow.
    const url = `${quizHref}?module=${encodeURIComponent(moduleCode)}&chapter=${encodeURIComponent(c.id)}`;
    router.push(url);
  };

  const solveAgain = () => {
    reset(c.id);
    openQuiz();
  };

  // Locked chapters: the row is present but inert — no click, no
  // Solve Again, dimmed bar, "Locked" pill. This is deliberately a
  // static <div>, not a role=button, so screen readers don't
  // announce it as actionable.
  if (locked) {
    return (
      <div
        aria-disabled
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '18px 20px',
          borderRadius: 14,
          background: 'rgba(18,17,28,0.7)',
          border: '1px dashed rgba(255,255,255,0.09)',
          cursor: 'not-allowed',
          opacity: 0.72,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            flex: 'none',
            borderRadius: 11,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: '#8B98A6',
          }}
        >
          <Lock style={{ width: 16, height: 16 }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: '#8B98A6' }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: '#8B98A6', marginTop: 6 }}>
            Questions coming soon
          </div>
        </div>

        <span
          style={{
            ...statusStyle,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            padding: '5px 10px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            flex: 'none',
          }}
        >
          {statusText}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      onClick={openQuiz}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuiz(); } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '18px 20px',
        borderRadius: 14,
        background: '#132B45',
        border: '1px solid rgba(255,255,255,0.07)',
        cursor: 'pointer',
      }}
    >
      {/* Index badge */}
      <div
        style={{
          width: 40,
          height: 40,
          flex: 'none',
          borderRadius: 11,
          background: 'rgba(0,166,166,0.12)',
          border: '1px solid rgba(0,166,166,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-monospace,Menlo,monospace',
          fontSize: 13,
          fontWeight: 700,
          color: '#33BFBF',
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Name + progress bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: '#F7F9FA' }}>
          {c.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${prog}%`, height: '100%', background: barColor, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, minWidth: 38, textAlign: 'right', color: pctColor }}>
            {prog}%
          </span>
        </div>
      </div>

      {/* Status pill */}
      <span
        style={{
          ...statusStyle,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '5px 10px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          flex: 'none',
        }}
      >
        {statusText}
      </span>

      {/* Solve Again — only on completed chapters. Stops the row
          click from firing so `openQuiz` doesn't race the reset. */}
      {done && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); solveAgain(); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 700,
            color: '#F7F9FA',
            background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
            border: '1px solid transparent',
            padding: '8px 14px',
            borderRadius: 9,
            cursor: 'pointer',
            boxShadow: '0 0 14px rgba(0,166,166,0.35)',
            flex: 'none',
          }}
        >
          <RotateCcw style={{ width: 13, height: 13 }} />
          Solve Again
        </button>
      )}
    </motion.div>
  );
}
