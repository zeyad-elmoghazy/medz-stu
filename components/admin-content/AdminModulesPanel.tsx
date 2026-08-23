'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminModules,
  fetchReferenceBooks,
  patchAdminModule,
  type AdminModule,
  type ReferenceBook,
} from '@/lib/admin-content-api';

const CARD: React.CSSProperties = {
  background: '#161B26',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 0,
  overflow: 'hidden',
};

const SELECT: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 9,
  background: '#0F0F1A',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F8FAFC',
  fontSize: 12.5,
  fontFamily: 'inherit',
};

/**
 * Book selection only — no module renaming, no book creation or
 * management. Books are still added directly via SQL; this control
 * just assigns an existing reference_books row to a module.
 */
export function AdminModulesPanel() {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [books, setBooks] = useState<ReferenceBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ modules: m }, { books: b }] = await Promise.all([fetchAdminModules(), fetchReferenceBooks()]);
      setModules(m);
      setBooks(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bookTitle = (id: string | null) => (id ? books.find((b) => b.id === id)?.title ?? 'Unknown book' : 'None');

  const handleSave = useCallback(
    async (code: string) => {
      const nextId = pending[code];
      if (nextId === undefined) return;
      setSaving((prev) => ({ ...prev, [code]: true }));
      try {
        const { module: updated } = await patchAdminModule(code, { book_id: nextId || null });
        setModules((prev) => prev.map((m) => (m.code === code ? updated : m)));
        setPending((prev) => {
          const c = { ...prev };
          delete c[code];
          return c;
        });
        setSavedFlash((prev) => ({ ...prev, [code]: true }));
        window.setTimeout(() => setSavedFlash((prev) => ({ ...prev, [code]: false })), 2000);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving((prev) => ({ ...prev, [code]: false }));
      }
    },
    [pending]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div role="alert" style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 12.5, color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      <div style={CARD}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Module reference books</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{modules.length} module{modules.length === 1 ? '' : 's'}</div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading…</div>
        ) : (
          <div>
            {modules.map((m) => {
              const currentBookId = m.book_id ?? '';
              const selected = pending[m.code] ?? currentBookId;
              const dirty = pending[m.code] !== undefined && pending[m.code] !== currentBookId;
              return (
                <div
                  key={m.code}
                  style={{
                    padding: '14px 22px',
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 200px 240px 90px',
                    gap: 14,
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#C4B5FD',
                      background: 'rgba(124,58,237,0.16)',
                      border: '1px solid rgba(139,92,246,0.35)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      textAlign: 'center',
                    }}
                  >
                    {m.code}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: m.book_id ? '#CBD5E1' : '#64748B' }}>{bookTitle(m.book_id)}</span>
                  <select
                    value={selected}
                    onChange={(e) => setPending((prev) => ({ ...prev, [m.code]: e.target.value }))}
                    style={SELECT}
                  >
                    <option value="">None</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!dirty || saving[m.code]}
                    onClick={() => handleSave(m.code)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: dirty ? '#fff' : '#475569',
                      background: dirty ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : 'transparent',
                      border: dirty ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      padding: '8px 14px',
                      borderRadius: 9,
                      cursor: dirty && !saving[m.code] ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    {saving[m.code] ? 'Saving…' : savedFlash[m.code] ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
