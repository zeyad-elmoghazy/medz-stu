'use client';

import Link from 'next/link';
import type { ExamPlan } from '@/lib/student/exam-plan';

/**
 * Home card under "next step": days to the nearest exam and the daily target.
 * Rendered only when the API returns a plan, i.e. once exam dates are filled
 * in lib/exam-schedule.ts. `href` is where "Study now" goes (the student's next step).
 */
export function ExamCountdownCard({ plan, href }: { plan: ExamPlan; href: string }) {
  const days = `${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'}`;

  let title: string;
  let detail: string;
  let cta: { label: string; href: string } | null;
  if (plan.status === 'today') {
    title = `${plan.label}: today`;
    detail = "You've put in the work. Good luck!";
    cta = null;
  } else if (plan.status === 'done') {
    title = `${days} to ${plan.label}`;
    detail = "You've covered everything. Keep sharp with a custom exam.";
    cta = { label: 'Custom exam', href: '/student/exam' };
  } else {
    title = `${days} to ${plan.label}`;
    detail = `${plan.remaining} ${plan.remaining === 1 ? 'question' : 'questions'} left · about ${plan.perDay} a day gets you there`;
    cta = { label: plan.perDay === 1 ? "Do today's question" : `Do today's ${plan.perDay}`, href };
  }

  return (
    // Not .mz-dash-sec: that class pads 24px/32px on phones, which puts too
    // much air between this card and the next-step card above it.
    <section style={{ padding: '14px 44px 0' }} className="mz-dash-exam">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '20px 24px',
          borderRadius: 16,
          background: 'var(--surface)',
          border: '1px solid var(--line2)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--accent-text)',
            }}
          >
            Exam countdown
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              marginTop: 6,
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 4 }}>{detail}</div>
        </div>
        {cta && (
          <Link
            href={cta.href}
            style={{
              flex: 'none',
              fontSize: 14,
              fontWeight: 700,
              color: '#F7F9FA',
              background: 'var(--accent-text)',
              padding: '12px 20px',
              borderRadius: 11,
              textDecoration: 'none',
            }}
          >
            {cta.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
