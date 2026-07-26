'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ModuleWithChapters } from '@/lib/professor-api';

// ponytail: localStorage-backed. Ledger row → DB table when
// challenges leave demo. All CRUD lives in this component.
const STORAGE_KEY = 'medz.professor.challenges.v1';

type Challenge = {
  id: string;
  title: string;
  moduleCode: string;
  chapterName: string;
  questionCount: number;
  durationMin: number;
  releaseAt: string;      // ISO
  scheduled: boolean;     // false = released now
  createdAt: string;
};

function loadAll(): Challenge[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Challenge[]) : [];
  } catch {
    return [];
  }
}

function saveAll(items: Challenge[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or private mode — non-fatal for demo
  }
}

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 24,
};

const INPUT: React.CSSProperties = {
  width: '100%',
  background: '#0F0F1A',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  padding: '11px 13px',
  color: '#F8FAFC',
  fontSize: 13.5,
  fontFamily: 'inherit',
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#CBD5E1',
  marginBottom: 8,
};

export function PostLecturePanel({ modules }: { modules: ModuleWithChapters[] }) {
  const activeModules = useMemo(() => modules.filter((m) => m.is_active), [modules]);

  const [items, setItems] = useState<Challenge[]>([]);
  const [title, setTitle] = useState('');
  const [moduleCode, setModuleCode] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [count, setCount] = useState(5);
  const [duration, setDuration] = useState(10);
  const [scheduled, setScheduled] = useState(false);
  const [releaseAt, setReleaseAt] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setItems(loadAll());
  }, []);

  useEffect(() => {
    if (!moduleCode && activeModules[0]) {
      setModuleCode(activeModules[0].code);
      setChapterId(activeModules[0].chapters[0]?.id ?? '');
    }
  }, [activeModules, moduleCode]);

  const currentModule = modules.find((m) => m.code === moduleCode) ?? null;
  const currentChapter = currentModule?.chapters.find((c) => c.id === chapterId);

  const canCreate =
    title.trim().length >= 3 && !!currentChapter && count > 0 && duration > 0;

  const handleCreate = () => {
    if (!canCreate || !currentModule || !currentChapter) return;
    const iso = scheduled && releaseAt
      ? new Date(releaseAt).toISOString()
      : new Date().toISOString();
    const next: Challenge = {
      id: crypto.randomUUID(),
      title: title.trim(),
      moduleCode: currentModule.code,
      chapterName: currentChapter.name,
      questionCount: count,
      durationMin: duration,
      releaseAt: iso,
      scheduled,
      createdAt: new Date().toISOString(),
    };
    const updated = [next, ...items];
    setItems(updated);
    saveAll(updated);
    setTitle('');
    setToast(
      scheduled
        ? `Scheduled for ${new Date(iso).toLocaleString()}`
        : 'Released — students can see it now.'
    );
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((c) => c.id !== id);
    setItems(updated);
    saveAll(updated);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 22, alignItems: 'start' }}>
      {/* Left: create form */}
      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Create a post-lecture challenge
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>
          A short set of MCQs students take right after your lecture.
        </div>

        <div style={LABEL}>Title</div>
        <input
          style={INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Epithelium — quick check"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={LABEL}>Module</div>
            <select
              style={INPUT}
              value={moduleCode}
              onChange={(e) => {
                setModuleCode(e.target.value);
                const m = modules.find((mm) => mm.code === e.target.value);
                setChapterId(m?.chapters[0]?.id ?? '');
              }}
            >
              {activeModules.length === 0 && <option value="">No active modules</option>}
              {activeModules.map((m) => (
                <option key={m.code} value={m.code}>
                  HIST {m.code} · {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={LABEL}>Chapter</div>
            <select
              style={INPUT}
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              disabled={!currentModule}
            >
              {(currentModule?.chapters ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={LABEL}>Questions</div>
            <input
              style={INPUT}
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
          </div>
          <div>
            <div style={LABEL}>Duration (minutes)</div>
            <input
              style={INPUT}
              type="number"
              min={1}
              max={120}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {[
            { key: false, label: 'Release now' },
            { key: true, label: 'Schedule' },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setScheduled(opt.key)}
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: 700,
                padding: '10px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                color: scheduled === opt.key ? '#F8FAFC' : '#94A3B8',
                background: scheduled === opt.key ? 'rgba(124,58,237,0.16)' : 'transparent',
                border: `1px solid ${scheduled === opt.key ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {scheduled && (
          <>
            <div style={{ ...LABEL, marginTop: 16 }}>Release at</div>
            <input
              style={INPUT}
              type="datetime-local"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
            />
          </>
        )}

        {toast && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.35)',
              borderRadius: 10,
              fontSize: 12.5,
              color: '#6EE7B7',
            }}
          >
            ✓ {toast}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            marginTop: 20,
            width: '100%',
            fontSize: 13,
            fontWeight: 700,
            padding: 13,
            borderRadius: 12,
            cursor: canCreate ? 'pointer' : 'not-allowed',
            color: canCreate ? '#fff' : '#64748B',
            background: canCreate
              ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)'
              : 'rgba(255,255,255,0.04)',
            boxShadow: canCreate ? '0 0 20px rgba(124,58,237,0.35)' : 'none',
            border: 'none',
            fontFamily: 'inherit',
          }}
        >
          {scheduled ? 'Schedule challenge →' : 'Release challenge →'}
        </button>
      </div>

      {/* Right: list of created challenges */}
      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Your challenges
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748B' }}>
            None yet. Create one on the left.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>
                    {c.title}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    style={{
                      fontSize: 11,
                      color: '#94A3B8',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    aria-label="Delete challenge"
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  HIST {c.moduleCode} · {c.chapterName}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  {c.questionCount} Qs · {c.durationMin} min ·{' '}
                  {c.scheduled ? (
                    <span style={{ color: '#F59E0B' }}>
                      Scheduled {new Date(c.releaseAt).toLocaleString()}
                    </span>
                  ) : (
                    <span style={{ color: '#10B981' }}>Live now</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
