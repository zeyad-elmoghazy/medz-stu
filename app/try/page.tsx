import Link from 'next/link';
import { TryQuiz, type TryYear } from '@/components/try/TryQuiz';
import { loadTrySamples, toPublicQuestions } from '@/lib/server/try-questions';

// Rendered per request, not at build time: a database hiccup during `next build`
// must never fail a deploy. The samples are cached per server instance for a
// few minutes (lib/server/try-questions.ts), so this stays cheap.
export const dynamic = 'force-dynamic';

const SIGNUP_HREF = '/signup?utm_source=try&utm_medium=web&utm_campaign=try-page';

export default async function TryPage() {
  let samples: Awaited<ReturnType<typeof loadTrySamples>> = [];
  try {
    samples = await loadTrySamples();
  } catch (err) {
    // Show the "coming soon" view rather than an error page.
    console.error('[try] could not load the samples:', err);
  }
  // Only the questions and choices cross to the browser, never the answer key.
  const years: TryYear[] = samples.map((s) => ({
    year: s.year,
    moduleName: s.moduleName,
    questions: toPublicQuestions(s.rows),
  }));

  return (
    <main data-mz-root style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 96px' }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)' }}>
          ← Back to MediZee
        </Link>

        {years.length > 0 ? (
          <>
            <h1 style={{ margin: '24px 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>
              Try real questions, free
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text2)', marginBottom: 28 }}>
              No account needed. Pick your year, answer each question and see the explanation straight
              away.
            </p>
            <TryQuiz years={years} />
          </>
        ) : (
          <>
            <h1 style={{ margin: '24px 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>
              Try MediZee
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text2)', marginBottom: 28 }}>
              Our free sample questions are coming soon. You can already create a free account and
              practise the full question bank.
            </p>
            <Link
              href={SIGNUP_HREF}
              style={{
                display: 'inline-flex',
                padding: '12px 20px',
                borderRadius: 11,
                background: 'var(--accent-text)',
                color: '#F7F9FA',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Create your free account →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
