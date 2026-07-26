'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ModuleWithChapters } from '@/lib/professor-api';

// ponytail: localStorage-backed for demo, same shape a DB row
// would take. Move to Supabase when exams need to be shared
// across professors.
const STORAGE_KEY = 'medz.professor.exams.v1';

type Exam = {
  id: string;
  title: string;
  subject: string;             // "histology"
  modules: string[];           // module codes included
  questionCount: number;
  durationMin: number;
  startAt: string;             // ISO
  endAt: string;               // ISO
  passMark: number;            // percent 0-100
  createdAt: string;
};

function loadAll(): Exam[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Exam[]) : [];
  } catch {
    return [];
  }
}

function saveAll(items: Exam[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // non-fatal
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

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function MockExamsPanel({ modules }: { modules: ModuleWithChapters[] }) {
  const activeModules = useMemo(() => modules.filter((m) => m.is_active), [modules]);

  const [items, setItems] = useState<Exam[]>([]);
  const [title, setTitle] = useState('');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(50);
  const [duration, setDuration] = useState(90);
  const [passMark, setPassMark] = useState(60);
  const [startAt, setStartAt] = useState(toLocalInput(new Date(Date.now() + 86400000)));
  const [endAt, setEndAt] = useState(
    toLocalInput(new Date(Date.now() + 86400000 + 7 * 86400000))
  );
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'scheduled' | 'past'>('scheduled');

  useEffect(() => {
    setItems(loadAll());
  }, []);

  useEffect(() => {
    if (selectedModules.size === 0 && activeModules[0]) {
      setSelectedModules(new Set([activeModules[0].code]));
    }
  }, [activeModules, selectedModules.size]);

  const toggleModule = (code: string) => {
    const next = new Set(selectedModules);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedModules(next);
  };

  const canCreate =
    title.trim().length >= 3 &&
    selectedModules.size > 0 &&
    count > 0 &&
    duration > 0 &&
    startAt &&
    endAt;

  const handleCreate = () => {
    if (!canCreate) return;
    const startIso = new Date(startAt).toISOString();
    const endIso = new Date(endAt).toISOString();
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setToast('End must be after start.');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    const exam: Exam = {
      id: crypto.randomUUID(),
      title: title.trim(),
      subject: 'histology',
      modules: Array.from(selectedModules),
      questionCount: count,
      durationMin: duration,
      startAt: startIso,
      endAt: endIso,
      passMark,
      createdAt: new Date().toISOString(),
    };
    const updated = [exam, ...items];
    setItems(updated);
    saveAll(updated);
    setTitle('');
    setToast(`Exam scheduled — window opens ${new Date(startIso).toLocaleString()}.`);
    window.setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((e) => e.id !== id);
    setItems(updated);
    saveAll(updated);
  };

  const now = Date.now();
  const scheduledExams = items.filter((e) => new Date(e.endAt).getTime() >= now);
  const pastExams = items.filter((e) => new Date(e.endAt).getTime() < now);
  const visible = tab === 'scheduled' ? scheduledExams : pastExams;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 22, alignItems: 'start' }}>
      {/* Left: create form */}
      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Schedule a mock exam
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 20 }}>
          Timed, auto-graded, drawn from your published Question Bank.
        </div>

        <div style={LABEL}>Title</div>
        <input
          style={INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Midterm — Histology Block 1"
        />

        <div style={{ ...LABEL, marginTop: 16 }}>Modules to draw from</div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: 12,
            background: '#0F0F1A',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
          }}
        >
          {activeModules.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748B' }}>
              No active modules — an admin needs to assign you first.
            </div>
          )}
          {activeModules.map((m) => {
            const on = selectedModules.has(m.code);
            return (
              <button
                key={m.code}
                type="button"
                onClick={() => toggleModule(m.code)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: on ? '#F8FAFC' : '#94A3B8',
                  background: on ? 'rgba(124,58,237,0.16)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  fontFamily: 'inherit',
                }}
              >
                {on ? '✓ ' : ''}HIST {m.code}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={LABEL}>Questions</div>
            <input
              style={INPUT}
              type="number"
              min={5}
              max={200}
              value={count}
              onChange={(e) => setCount(Math.max(5, Math.min(200, Number(e.target.value) || 5)))}
            />
          </div>
          <div>
            <div style={LABEL}>Duration (min)</div>
            <input
              style={INPUT}
              type="number"
              min={5}
              max={240}
              value={duration}
              onChange={(e) =>
                setDuration(Math.max(5, Math.min(240, Number(e.target.value) || 5)))
              }
            />
          </div>
          <div>
            <div style={LABEL}>Pass mark %</div>
            <input
              style={INPUT}
              type="number"
              min={0}
              max={100}
              value={passMark}
              onChange={(e) =>
                setPassMark(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <div style={LABEL}>Window opens</div>
            <input
              style={INPUT}
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div>
            <div style={LABEL}>Window closes</div>
            <input
              style={INPUT}
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>

        {toast && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: toast.startsWith('End')
                ? 'rgba(239,68,68,0.1)'
                : 'rgba(16,185,129,0.1)',
              border: `1px solid ${
                toast.startsWith('End') ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'
              }`,
              borderRadius: 10,
              fontSize: 12.5,
              color: toast.startsWith('End') ? '#FCA5A5' : '#6EE7B7',
            }}
          >
            {toast.startsWith('End') ? '⚠ ' : '✓ '}
            {toast}
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
          Schedule exam →
        </button>
      </div>

      {/* Right: list */}
      <div style={CARD}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['scheduled', 'past'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 14px',
                borderRadius: 9,
                cursor: 'pointer',
                color: tab === k ? '#F8FAFC' : '#94A3B8',
                background: tab === k ? 'rgba(124,58,237,0.14)' : 'transparent',
                border: `1px solid ${tab === k ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                textTransform: 'capitalize',
                fontFamily: 'inherit',
              }}
            >
              {k} ({k === 'scheduled' ? scheduledExams.length : pastExams.length})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748B' }}>
            {tab === 'scheduled'
              ? 'No exams scheduled yet.'
              : 'No past exams.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: 12,
                  background: '#0F0F1A',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>
                    {e.title}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    style={{
                      fontSize: 11,
                      color: '#94A3B8',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    aria-label="Delete exam"
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  {e.modules.map((c) => `HIST ${c}`).join(', ')}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  {e.questionCount} Qs · {e.durationMin} min · pass ≥ {e.passMark}%
                </div>
                <div style={{ fontSize: 11, color: '#C4B5FD', marginTop: 4 }}>
                  {new Date(e.startAt).toLocaleString()} →{' '}
                  {new Date(e.endAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
