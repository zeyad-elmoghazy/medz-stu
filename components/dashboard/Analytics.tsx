'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type AnalyticsPoint = { date: string; accuracy: number };

/**
 * Heavy analytics panel — owns the Recharts dependency tree.
 *
 * Recharts (and its d3-* transitive deps) is roughly 100KB
 * gzipped. We pay that cost on demand by dynamic-importing this
 * file from the parent page; first contentful paint of the page
 * stays cheap even though the chart is rich.
 */
export default function AnalyticsDashboard({
  data,
  currentAccuracy,
}: {
  data: AnalyticsPoint[];
  currentAccuracy: number;
}) {
  return (
    <section
      className="rounded-2xl p-6"
      style={{ backgroundColor: '#132B45', border: '1px solid #132B45' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#33BFBF]">
            Accuracy
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Accuracy over time
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Eight historical sessions plus today&apos;s attempt.
          </p>
        </div>
        <span className="rounded-full bg-[#33BFBF]/15 px-2.5 py-1 text-xs text-[#33BFBF]">
          Today: {currentAccuracy}%
        </span>
      </div>

      <div className="mt-6 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="accuracyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00A6A6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00A6A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#8B98A6"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#8B98A6"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: '#132B45',
                border: '1px solid #132B45',
                borderRadius: '0.75rem',
                color: '#F7F9FA',
                fontSize: '0.8rem',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
              labelStyle={{
                color: '#8B98A6',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
              cursor={{ stroke: '#00A6A6', strokeDasharray: '3 3', strokeOpacity: 0.5 }}
              formatter={(value: number) => [`${value}%`, 'Accuracy']}
            />
            <Area
              type="monotone"
              dataKey="accuracy"
              stroke="#33BFBF"
              strokeWidth={2.5}
              fill="url(#accuracyFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
