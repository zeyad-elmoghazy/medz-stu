'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import {
  HISTOLOGY_ACADEMIC_YEARS,
  HISTOLOGY_SUBJECT_PREFIX,
  type Module,
} from '@/data/histology-catalog';
import { useModuleProgress } from '@/lib/chapter-progress';

// =============================================================
// Modules page — /student/subjects/[subjectId]
// Ported from `MedZ Home.dc.html` → `isModules` section.
// Structure: subject header banner → academic-year sections →
// per-module cards with a chapter preview list.
// =============================================================

// Only Histology has a real module catalog in the demo. Other
// subjects will be added; for now we early-return notFound.
const SUPPORTED_SUBJECTS: Record<string, {
  name: string;
  image: string;
  professor: string;
  profRole: string;
  profInitials: string;
  qsLabel: string;
  prefix: string;
}> = {
  histology: {
    name: 'Histology',
    image: '/subjects/histology.webp',
    professor: 'Curated by MedZ',
    profRole: '450+ MCQs · Live now',
    profInitials: 'MZ',
    qsLabel: '450+',
    prefix: HISTOLOGY_SUBJECT_PREFIX,
  },
};

const canvasBg: CSSProperties = {
  width: 1280,
  margin: '0 auto',
  position: 'relative',
  overflow: 'hidden',
  background:
    'radial-gradient(900px 520px at 88% -6%, rgba(124,58,237,0.3), transparent 60%),' +
    'radial-gradient(760px 520px at 6% 42%, rgba(88,28,235,0.18), transparent 55%),' +
    '#08070F',
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

export default function SubjectModulesPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params.subjectId;
  const subject = SUPPORTED_SUBJECTS[subjectId];
  if (!subject) notFound();

  const totalModules = HISTOLOGY_ACADEMIC_YEARS.reduce((n, y) => n + y.modules.length, 0);
  const totalYears = HISTOLOGY_ACADEMIC_YEARS.length;

  // Live per-module and per-chapter published counts. `liveCounts`
  // is per-module total (module.code → sum); `chapterCounts` is
  // per-chapter (module.code:chapter.slug → count) so a chapter can
  // unlock the instant the professor publishes one question in it.
  const [liveCounts, setLiveCounts] = useState<Map<string, number>>(new Map());
  const [chapterCounts, setChapterCounts] = useState<Map<string, number>>(new Map());
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
        const mods = new Map<string, number>();
        const chs = new Map<string, number>();
        for (const m of body.modules ?? []) {
          let sum = 0;
          for (const c of m.chapters ?? []) {
            const n = Number(c.published_count) || 0;
            chs.set(`${m.code}:${c.slug}`, n);
            sum += n;
          }
          mods.set(m.code, sum);
        }
        setLiveCounts(mods);
        setChapterCounts(chs);
      } catch {
        /* stay zero */
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#08070F', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={canvasBg}>
        <div aria-hidden style={dotTexture} />

        <StudentNavbar activeLabel="Subjects" />

        <section style={{ position: 'relative', padding: '34px 44px 56px' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', marginBottom: 22 }}>
            <Link href="/student/dashboard" style={{ color: '#94A3B8', textDecoration: 'none' }}>Home</Link>
            <span>›</span>
            <Link href="/student/subjects" style={{ color: '#94A3B8', textDecoration: 'none' }}>Subjects</Link>
            <span>›</span>
            <span style={{ color: '#C4B5FD', fontWeight: 600 }}>{subject.name}</span>
          </div>

          {/* Subject header banner */}
          <div
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
              gap: 24,
              alignItems: 'center',
              borderRadius: 20,
              overflow: 'hidden',
              padding: 24,
              background: 'linear-gradient(135deg,#1c1338,#120f22)',
              border: '1px solid rgba(139,92,246,0.4)',
              boxShadow: '0 0 40px rgba(124,58,237,0.18)',
              marginBottom: 32,
            }}
          >
            <div style={{ height: 150, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', position: 'relative' }}>
              <Image src={subject.image} alt={subject.name} fill sizes="200px" style={{ objectFit: 'cover' }} />
            </div>
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#fff',
                  background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                  padding: '5px 11px',
                  borderRadius: 7,
                  boxShadow: '0 0 16px rgba(124,58,237,0.5)',
                }}
              >
                Exclusive Module
              </div>
              <h1 style={{ margin: '12px 0 0', fontSize: 38, fontWeight: 900, letterSpacing: '-0.03em', color: '#F8FAFC' }}>
                {subject.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {subject.profInitials}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>{subject.professor}</div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>{subject.profRole}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 26, marginTop: 18 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#8B5CF6' }}>{totalModules}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Modules</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#8B5CF6' }}>
                    {Array.from(liveCounts.values()).reduce((a, n) => a + n, 0)}
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Questions</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981' }}>{totalYears}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Academic Years</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>
              Modules by Academic Year
            </h2>
          </div>

          {/* Academic year groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
            {HISTOLOGY_ACADEMIC_YEARS.map((y) => (
              <div key={y.yearNum}>
                {/* Year header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        flex: 'none',
                        borderRadius: 10,
                        background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#fff',
                        boxShadow: '0 0 16px rgba(124,58,237,0.4)',
                      }}
                    >
                      {y.yearNum}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: '#F8FAFC' }}>
                        {y.year}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{y.label}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                </div>

                {/* Modules grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
                  {y.modules.map((m) => (
                    <ModuleCard
                      key={m.code}
                      subjectId={subjectId}
                      prefix={subject.prefix}
                      module={m}
                      liveQs={liveCounts.get(m.code)}
                      chapterCounts={chapterCounts}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ModuleCard({
  subjectId,
  prefix,
  module: m,
  liveQs,
  chapterCounts,
}: {
  subjectId: string;
  prefix: string;
  module: Module;
  liveQs?: number;
  chapterCounts: Map<string, number>;
}) {
  const progress = useModuleProgress(
    subjectId,
    m.code,
    useMemo(() => m.chapters.map((c) => ({ id: c.id, defaultProgress: c.defaultProgress })), [m]),
  );

  // A chapter is unlocked if the static catalog says so OR the live
  // published_count is > 0 (professor just published something).
  const isUnlocked = (c: { id: string; published: boolean }) =>
    c.published || (chapterCounts.get(`${m.code}:${c.id}`) ?? 0) > 0;

  const publishedChapters = m.chapters.filter(isUnlocked);
  const doneCount = publishedChapters.filter((c) => (progress[c.id] ?? c.defaultProgress) === 100).length;
  const avgProgress = publishedChapters.length === 0
    ? 0
    : Math.round(
        publishedChapters.reduce((a, c) => a + (progress[c.id] ?? c.defaultProgress), 0) /
          publishedChapters.length,
      );

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#12111C',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Head — module code + question count + name */}
      <div
        style={{
          padding: '16px 16px 14px',
          background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(139,92,246,0.03))',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span
            style={{
              fontFamily: 'ui-monospace,Menlo,monospace',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#C4B5FD',
              background: 'rgba(124,58,237,0.16)',
              border: '1px solid rgba(139,92,246,0.35)',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            {prefix} {m.code}
          </span>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>{liveQs ?? m.qs} Qs</span>
        </div>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            marginTop: 11,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            color: '#F8FAFC',
          }}
        >
          {m.name}
        </div>
        {/* Aggregate progress — appears only after the student has
            actually started something in this module. Keeps the
            "not started" cards clean per the design mock. */}
        {avgProgress > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 5 }}>
              <span style={{ color: '#94A3B8' }}>{doneCount}/{m.chapters.length} chapters</span>
              <span style={{ color: '#8B5CF6', fontWeight: 700 }}>{avgProgress}%</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${avgProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg,#7C3AED,#8B5CF6)',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Chapter preview */}
      <div style={{ padding: '6px 16px 14px' }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#64748B',
            margin: '12px 0 8px',
          }}
        >
          Chapters
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {m.chapters.map((c) => {
            const locked = !isUnlocked(c);
            const done = !locked && (progress[c.id] ?? c.defaultProgress) === 100;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '7px 0',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 12,
                  color: locked ? '#64748B' : done ? '#94A3B8' : '#CBD5E1',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    flex: 'none',
                    borderRadius: '50%',
                    background: locked ? '#334155' : done ? '#10B981' : '#8B5CF6',
                  }}
                />
                {locked && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: '#64748B',
                      textTransform: 'uppercase',
                    }}
                  >
                    Locked
                  </span>
                )}
                <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{c.name}</span>
              </div>
            );
          })}
        </div>

        <Link
          href={`/student/subjects/${subjectId}/${m.code}`}
          style={{
            display: 'block',
            marginTop: 13,
            textAlign: 'center',
            fontSize: 11.5,
            fontWeight: 700,
            color: '#C4B5FD',
            border: '1px solid rgba(124,58,237,0.4)',
            padding: 9,
            borderRadius: 9,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          View Chapters →
        </Link>
      </div>
    </motion.div>
  );
}
