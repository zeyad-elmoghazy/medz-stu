'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { HISTOLOGY_ACADEMIC_YEARS } from '@/data/histology-catalog';
import { useQuizStore } from '@/lib/store';

// The only subject with a real question pool right now is Histology.
// Other subjects live in the catalog but are locked — surface them
// here so the shape of the picker is real, but disable selection.
const SUBJECTS = [
  { id: 'histology', name: 'Histology', available: true },
  { id: 'anatomy', name: 'Anatomy', available: false },
  { id: 'physiology', name: 'Physiology', available: false },
  { id: 'biochemistry', name: 'Biochemistry', available: false },
  { id: 'pathology', name: 'Pathology', available: false },
  { id: 'pharmacology', name: 'Pharmacology', available: false },
];

const LENGTHS = [10, 20, 30, 50];

export default function CustomExamPage() {
  const router = useRouter();
  const startSession = useQuizStore((s) => s.startSession);

  const [subjectId, setSubjectId] = useState<string>('histology');
  const [moduleCode, setModuleCode] = useState<string | null>(null);
  const [chapterIds, setChapterIds] = useState<Set<string>>(new Set());
  const [length, setLength] = useState<number>(20);

  const allModules = useMemo(
    () => HISTOLOGY_ACADEMIC_YEARS.flatMap((y) => y.modules.map((m) => ({ year: y, module: m }))),
    []
  );

  const activeModule = allModules.find((m) => m.module.code === moduleCode)?.module ?? null;

  function toggleChapter(id: string) {
    setChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generate() {
    if (subjectId !== 'histology') return;
    startSession();
    router.push('/student/quiz/histology');
  }

  const canGenerate = subjectId === 'histology';

  return (
    <main style={{ minHeight: '100vh', background: '#08070F', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <StudentNavbar activeLabel="Custom Exam" />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 32px 80px' }}>
        <header style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#8B5CF6', textTransform: 'uppercase' }}>
            Custom Exam Generator
          </p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: '#F8FAFC' }}>
            Build your own practice exam
          </h1>
          <p style={{ fontSize: 15, color: '#94A3B8', margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
            Pick a subject, then narrow down by module and chapter. Choose how many questions
            you want and we&apos;ll assemble the exam for you.
          </p>
        </header>

        {/* STEP 1 — Subject */}
        <Section title="1. Subject" hint="Only unlocked subjects can generate exams for now.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {SUBJECTS.map((s) => {
              const selected = s.id === subjectId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => s.available && setSubjectId(s.id)}
                  disabled={!s.available}
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: selected ? 'rgba(124,58,237,0.14)' : '#12111C',
                    border: selected ? '1px solid rgba(139,92,246,0.55)' : '1px solid rgba(255,255,255,0.07)',
                    color: '#F8FAFC',
                    cursor: s.available ? 'pointer' : 'not-allowed',
                    opacity: s.available ? 1 : 0.55,
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: s.available ? '#C4B5FD' : '#64748B', marginTop: 4 }}>
                    {s.available ? 'Available' : 'Coming soon'}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* STEP 2 — Module */}
        <Section title="2. Module" hint="Leave blank to include every module.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <button
              type="button"
              onClick={() => { setModuleCode(null); setChapterIds(new Set()); }}
              style={pillStyle(moduleCode === null)}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>All modules</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Full subject range</div>
            </button>
            {allModules.map(({ module, year }) => {
              const selected = moduleCode === module.code;
              return (
                <button
                  key={module.code}
                  type="button"
                  onClick={() => { setModuleCode(module.code); setChapterIds(new Set()); }}
                  style={pillStyle(selected)}
                >
                  <div style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 700, letterSpacing: '0.08em' }}>
                    HIST {module.code} · {year.year}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginTop: 4 }}>
                    {module.name}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* STEP 3 — Chapters (only when a module is picked) */}
        {activeModule && (
          <Section title="3. Chapters" hint="Uncheck any chapter you want to skip.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {activeModule.chapters.map((c) => {
                const selected = chapterIds.size === 0 || chapterIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChapter(c.id)}
                    style={{
                      padding: '9px 14px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 600,
                      color: selected ? '#F8FAFC' : '#64748B',
                      background: selected ? 'rgba(124,58,237,0.18)' : 'transparent',
                      border: selected
                        ? '1px solid rgba(139,92,246,0.5)'
                        : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* STEP 4 — Length */}
        <Section title={activeModule ? '4. Length' : '3. Length'} hint="Number of questions in the generated exam.">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {LENGTHS.map((n) => {
              const selected = n === length;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLength(n)}
                  style={{
                    padding: '12px 22px',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 800,
                    color: selected ? '#fff' : '#94A3B8',
                    background: selected ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : '#12111C',
                    border: selected ? '1px solid transparent' : '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {n} Qs
                </button>
              );
            })}
          </div>
        </Section>

        {/* Generate */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            padding: '20px 22px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(139,92,246,0.06))',
            border: '1px solid rgba(139,92,246,0.35)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#C4B5FD', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Ready
            </div>
            <div style={{ fontSize: 16, color: '#F8FAFC', fontWeight: 700, marginTop: 4 }}>
              {SUBJECTS.find((s) => s.id === subjectId)?.name} ·{' '}
              {activeModule ? `HIST ${activeModule.code}` : 'All modules'} · {length} questions
            </div>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              background: canGenerate ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : '#334155',
              padding: '14px 26px',
              borderRadius: 12,
              boxShadow: canGenerate ? '0 0 24px rgba(124,58,237,0.4)' : 'none',
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            <Sparkles style={{ width: 15, height: 15 }} />
            Generate Exam
            <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

function pillStyle(selected: boolean): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: 12,
    background: selected ? 'rgba(124,58,237,0.14)' : '#12111C',
    border: selected ? '1px solid rgba(139,92,246,0.55)' : '1px solid rgba(255,255,255,0.07)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#F8FAFC',
  };
}
