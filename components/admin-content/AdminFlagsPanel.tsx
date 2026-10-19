'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminFlags,
  resolveAdminFlag,
  type AdminFlag,
  type AdminFlagStatus,
} from '@/lib/admin-content-api';
import { FLAG_REASON_LABELS, type FlagReason } from '@/lib/question-flags';

type Props = {
  onChanged: () => void | Promise<void>;
};

const CARD: React.CSSProperties = {
  background: '#132B45',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 20,
};

const REASON_COLOR: Record<string, { bg: string; color: string }> = {
  wrong_answer: { bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
  ambiguous: { bg: 'rgba(249,115,22,0.14)', color: '#F97316' },
  typo: { bg: 'rgba(14,165,233,0.14)', color: '#0EA5E9' },
  wrong_reference: { bg: 'rgba(168,85,247,0.14)', color: '#A855F7' },
  other: { bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
};

const FILTERS: { key: AdminFlagStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminFlagsPanel({ onChanged }: Props) {
  const [status, setStatus] = useState<AdminFlagStatus>('open');
  const [flags, setFlags] = useState<AdminFlag[]>([]);
  const [counts, setCounts] = useState({ open: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminFlags(status);
      setFlags(res.flags);
      setCounts(res.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggleResolved(flag: AdminFlag) {
    setBusy((b) => ({ ...b, [flag.id]: true }));
    setError(null);
    try {
      await resolveAdminFlag(flag.id, !flag.resolved);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setBusy((b) => ({ ...b, [flag.id]: false }));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const active = status === f.key;
          const count =
            f.key === 'open' ? counts.open : f.key === 'resolved' ? counts.resolved : counts.open + counts.resolved;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              aria-pressed={active}
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: '8px 14px',
                borderRadius: 10,
                color: active ? '#F7F9FA' : '#8B98A6',
                background: active ? 'rgba(0,166,166,0.18)' : 'transparent',
                border: `1px solid ${active ? 'rgba(0,166,166,0.6)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" style={{ ...CARD, color: '#EF4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && flags.length === 0 ? (
        <div style={{ ...CARD, color: '#8B98A6', fontSize: 13 }}>Loading reports…</div>
      ) : flags.length === 0 ? (
        <div style={{ ...CARD, color: '#8B98A6', fontSize: 13 }}>
          {status === 'open'
            ? 'No open reports. Student reports from the chapter quiz show up here.'
            : status === 'resolved'
              ? 'No resolved reports yet.'
              : 'No reports yet.'}
        </div>
      ) : (
        flags.map((flag) => {
          const reasonStyle = REASON_COLOR[flag.reason] ?? REASON_COLOR.other;
          const reasonLabel = FLAG_REASON_LABELS[flag.reason as FlagReason] ?? flag.reason;
          const isOpen = expanded === flag.id;
          const q = flag.question;
          const where = q
            ? [q.moduleCode && `Module ${q.moduleCode}`, q.subjectName, q.chapterName]
                .filter(Boolean)
                .join(' › ')
            : '';
          const reporterName = flag.reporter?.fullName ?? '';
          const reporterEmail = flag.reporter?.email ?? '';
          const reporterLabel =
            reporterName || reporterEmail
              ? [reporterName, reporterEmail].filter(Boolean).join(' · ')
              : 'a student';
          return (
            <div key={flag.id} style={{ ...CARD, opacity: flag.resolved ? 0.75 : 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: 999,
                        background: reasonStyle.bg,
                        color: reasonStyle.color,
                      }}
                    >
                      {reasonLabel}
                    </span>
                    <span style={{ fontSize: 11, color: '#8B98A6' }}>{formatWhen(flag.createdAt)}</span>
                    {flag.resolved && (
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 700 }}>
                        ✓ Resolved{flag.resolvedBy ? ` by ${flag.resolvedBy}` : ''}
                        {flag.resolvedAt ? ` · ${formatWhen(flag.resolvedAt)}` : ''}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: '#F7F9FA' }}>
                    {q ? q.text : `Question #${flag.questionId} (no longer available)`}
                  </div>
                  {where && <div style={{ fontSize: 11, color: '#8B98A6', marginTop: 4 }}>{where}</div>}

                  {flag.detail && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: '#F7F9FA',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8B98A6', marginBottom: 4, letterSpacing: '0.04em' }}>
                        STUDENT&apos;S NOTE
                      </div>
                      {flag.detail}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: '#8B98A6', marginTop: 10 }}>
                    Reported by {reporterLabel}
                  </div>

                  {q && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : flag.id)}
                      aria-expanded={isOpen}
                      style={{
                        marginTop: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#00A6A6',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isOpen ? 'Hide choices ▲' : 'Show choices & answer key ▼'}
                    </button>
                  )}
                  {q && isOpen && (
                    <ul
                      style={{
                        margin: '10px 0 0',
                        padding: 0,
                        listStyle: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      {q.choices.map((c) => {
                        const correct = c.id === q.correctAnswer;
                        return (
                          <li
                            key={c.id}
                            style={{
                              fontSize: 12,
                              padding: '6px 10px',
                              borderRadius: 8,
                              color: correct ? '#10B981' : '#F7F9FA',
                              background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${correct ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            <strong>{c.id.toUpperCase()}.</strong> {c.text}
                            {correct ? ' ✓ marked correct' : ''}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!!busy[flag.id]}
                  onClick={() => toggleResolved(flag)}
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    padding: '8px 14px',
                    borderRadius: 10,
                    cursor: busy[flag.id] ? 'not-allowed' : 'pointer',
                    opacity: busy[flag.id] ? 0.6 : 1,
                    color: flag.resolved ? '#8B98A6' : '#0B1F33',
                    background: flag.resolved ? 'transparent' : '#00A6A6',
                    border: flag.resolved ? '1px solid rgba(255,255,255,0.15)' : '1px solid #00A6A6',
                  }}
                >
                  {busy[flag.id] ? '…' : flag.resolved ? 'Reopen' : 'Mark resolved'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
