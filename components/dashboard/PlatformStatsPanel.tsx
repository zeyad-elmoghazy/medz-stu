'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DauPoint = { day: string; users: number };

/**
 * PlatformStatsPanel — owns the Recharts dependency tree.
 *
 * Extracted from the admin dashboard page so recharts is not in the
 * admin route's initial JS. The parent dynamic-imports this file
 * only when the admin actually views the analytics section.
 */
export default function PlatformStatsPanel({ data }: { data: DauPoint[] }) {
  return (
    <section
      id="analytics"
      className="rounded-2xl p-6 lg:p-7"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">
            Platform stats
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-white">
            Daily active users
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">Last 7 days</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
          +41% WoW
        </span>
      </div>

      <div className="mt-5 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9F67FF" stopOpacity={1} />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(124,58,237,0.08)' }}
              contentStyle={{
                background: '#0F0F1A',
                border: '1px solid #1E1E2E',
                borderRadius: '0.75rem',
                color: '#F8FAFC',
                fontSize: '0.8rem',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
              labelStyle={{
                color: '#94A3B8',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
              formatter={(value: number) => [value.toLocaleString(), 'Active users']}
            />
            <Bar dataKey="users" fill="url(#dauFill)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
