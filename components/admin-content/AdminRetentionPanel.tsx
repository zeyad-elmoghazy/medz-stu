'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchRetention, type AdminRetention } from '@/lib/admin-content-api';
import {
  FUNNEL,
  RETENTION_RANGES,
  formatPointLabel,
  niceMax,
  pctOfSignups,
  pointValue,
  type ChartMode,
  type FunnelKey,
  type RetentionPoint,
  type RetentionRange,
} from '@/lib/retention-series';

const CARD: React.CSSProperties = {
  background: '#132B45',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: 22,
};

const MUTED = '#8B98A6';

// Chart geometry (SVG user units; the SVG itself scales to its container).
const W = 720;
const H = 260;
const PAD = { l: 44, r: 16, t: 12, b: 28 };
const INNER_W = W - PAD.l - PAD.r;
const INNER_H = H - PAD.t - PAD.b;

const segBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 7,
  color: active ? '#F7F9FA' : MUTED,
  background: active ? 'rgba(0,166,166,0.2)' : 'transparent',
});

const SEGMENT: React.CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 3,
  background: '#0B1F33',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
};

function fmtValue(v: number, mode: ChartMode): string {
  return mode === 'percent' ? `${v}%` : String(v);
}

function baselineLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function AdminRetentionPanel() {
  const [range, setRange] = useState<RetentionRange>('1M');
  const [mode, setMode] = useState<ChartMode>('percent');
  const [hidden, setHidden] = useState<ReadonlySet<FunnelKey>>(new Set());
  const [data, setData] = useState<AdminRetention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRetention(range)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load retention data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const pickRange = (r: RetentionRange) => {
    if (r === range) return;
    setHoverIdx(null);
    setLoading(true);
    setRange(r);
  };

  const toggleLine = (key: FunnelKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const series = data?.series ?? [];
  const n = series.length;
  const step = data?.step ?? 'day';
  // In percent mode "Signed up" is always 100%, so it has no line or chip.
  const lines = FUNNEL.filter((f) => mode === 'count' || f.key !== 'signedUp');
  const visible = lines.filter((f) => !hidden.has(f.key));

  const rawMax = Math.max(0, ...series.flatMap((p) => visible.map((f) => pointValue(p, f.key, mode))));
  const yMax = niceMax(rawMax, mode);
  const x = (i: number) => (n <= 1 ? PAD.l + INNER_W / 2 : PAD.l + (INNER_W * i) / (n - 1));
  const y = (v: number) => PAD.t + INNER_H * (1 - v / yMax);

  const yTickCount = mode === 'count' && yMax < 4 ? yMax : 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, k) => (yMax * k) / yTickCount);
  const xTickCount = Math.min(5, n);
  const xTicks =
    n === 0
      ? []
      : Array.from({ length: xTickCount }, (_, k) =>
          xTickCount === 1 ? 0 : Math.round((k * (n - 1)) / (xTickCount - 1))
        );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const idx = n === 1 ? 0 : Math.round(((px - PAD.l) / INNER_W) * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  };

  const shown: RetentionPoint | null = n > 0 ? series[hoverIdx ?? n - 1] : null;
  const current = data?.current ?? null;
  const baseline = data?.baseline ?? null;
  const baseName = data ? baselineLabel(data.baselineDate) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            fontSize: 12.5,
            color: '#FCA5A5',
          }}
        >
          {error}
        </div>
      )}

      {data && !data.available && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.3)',
            borderRadius: 10,
            fontSize: 12.5,
            color: '#FDBA74',
          }}
        >
          Retention data isn&apos;t available yet: migration 050 (admin_retention_series) hasn&apos;t been
          applied to this database.
        </div>
      )}

      {/* ============ CHART ============ */}
      <div style={CARD}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Retention over time</div>
            <div style={{ fontSize: 11, color: MUTED }}>
              {mode === 'percent'
                ? 'Share of everyone who had signed up by then, who had reached each step.'
                : 'Number of students who had reached each step by then.'}
            </div>
          </div>
          <div role="group" aria-label="Chart units" style={SEGMENT}>
            <button type="button" aria-pressed={mode === 'percent'} style={segBtn(mode === 'percent')} onClick={() => setMode('percent')}>
              %
            </button>
            <button type="button" aria-pressed={mode === 'count'} style={segBtn(mode === 'count')} onClick={() => setMode('count')}>
              Count
            </button>
          </div>
        </div>

        {/* Readout + legend chips: values at the hovered point (latest when idle). */}
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, minHeight: 15 }}>
          {shown ? `${formatPointLabel(shown.t, step, true)}${hoverIdx === null ? ' (latest)' : ''}` : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {lines.map((f) => {
            const off = hidden.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleLine(f.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  color: off ? '#475569' : '#F7F9FA',
                  background: off ? 'transparent' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: off ? '#475569' : f.color, flex: 'none' }}
                />
                {f.short}
                {shown && (
                  <strong style={{ fontWeight: 700, color: off ? '#475569' : f.color }}>
                    {fmtValue(pointValue(shown, f.key, mode), mode)}
                  </strong>
                )}
              </button>
            );
          })}
        </div>

        {n === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, padding: '48px 0', textAlign: 'center' }}>
            {loading ? 'Loading…' : 'No retention data in this range yet.'}
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Line chart of retention funnel steps over time"
            onMouseMove={onMove}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ display: 'block', opacity: loading ? 0.45 : 1, transition: 'opacity 150ms' }}
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
                <text x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill={MUTED}>
                  {mode === 'percent' ? `${Math.round(v)}%` : Math.round(v)}
                </text>
              </g>
            ))}
            {xTicks.map((idx, k) => (
              <text
                key={`${idx}-${k}`}
                x={x(idx)}
                y={H - 8}
                fontSize={10}
                fill={MUTED}
                textAnchor={k === 0 && xTicks.length > 1 ? 'start' : k === xTicks.length - 1 && xTicks.length > 1 ? 'end' : 'middle'}
              >
                {formatPointLabel(series[idx].t, step)}
              </text>
            ))}

            {visible.map((f) =>
              n === 1 ? (
                <circle key={f.key} cx={x(0)} cy={y(pointValue(series[0], f.key, mode))} r={3.5} fill={f.color} />
              ) : (
                <polyline
                  key={f.key}
                  fill="none"
                  stroke={f.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={series.map((p, i) => `${x(i)},${y(pointValue(p, f.key, mode))}`).join(' ')}
                />
              )
            )}

            {hoverIdx !== null && (
              <g pointerEvents="none">
                <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.t} y2={PAD.t + INNER_H} stroke="rgba(255,255,255,0.25)" />
                {visible.map((f) => (
                  <circle
                    key={f.key}
                    cx={x(hoverIdx)}
                    cy={y(pointValue(series[hoverIdx], f.key, mode))}
                    r={3.5}
                    fill={f.color}
                    stroke="#132B45"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            )}
          </svg>
        )}

        {/* Stock-style range buttons, below the chart. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <div role="group" aria-label="Time range" style={SEGMENT}>
            {RETENTION_RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={range === r} style={segBtn(range === r)} onClick={() => pickRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ============ TABLE ============ */}
      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Funnel right now</div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 16 }}>
          {current ? `As of ${formatPointLabel(current.t, 'hour', true)} (Cairo time)` : loading ? 'Loading…' : 'No data yet.'}
        </div>
        {current && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Step', 'Count', '% of signups', `${baseName} baseline`].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        fontSize: 11,
                        fontWeight: 500,
                        color: MUTED,
                        padding: '0 0 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FUNNEL.map((f) => {
                  const cell: React.CSSProperties = {
                    padding: '11px 0',
                    textAlign: 'right',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  };
                  return (
                    <tr key={f.key}>
                      <td style={{ ...cell, textAlign: 'left' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: f.color,
                            marginRight: 9,
                          }}
                        />
                        {f.label}
                      </td>
                      <td style={{ ...cell, fontWeight: 700 }}>{current[f.key]}</td>
                      <td style={cell}>{Math.round(pctOfSignups(current, f.key))}%</td>
                      <td style={{ ...cell, color: MUTED }}>
                        {baseline
                          ? `${f.key === 'started' ? '~' : ''}${baseline[f.key]} · ${Math.round(pctOfSignups(baseline, f.key))}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 14, lineHeight: 1.5 }}>
          Students only. Each step counts everyone who ever reached it, so rows only grow over time. Days are
          Cairo calendar days. &ldquo;Started&rdquo; in the past is approximate: it is dated at the first
          finished quiz when the student finished one later.
        </div>
      </div>
    </div>
  );
}
