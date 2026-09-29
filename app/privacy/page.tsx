import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — MediZee',
};

export default function PrivacyPage() {
  return (
    <div data-mz-root style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)' }}>← Back to MediZee</Link>
        <h1 style={{ margin: '24px 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: 'var(--faint)' }}>
          Draft — pending legal review. Describes current data practices; not yet a final policy. Last edited 2026-09-27.
        </p>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24, fontSize: 15, lineHeight: 1.7, color: 'var(--text2)' }}>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>1. What we collect</h2>
            <p>Creating an account collects your email address and a display name. Using MediZee collects the activity that makes the product work: your quiz attempts and answers, accuracy and streak history, bookmarks, and any notes you write on a question.</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>2. How it&apos;s used</h2>
            <p>This data powers the features you see: your personal analytics dashboard, streaks, the quiz-on-mistakes challenge, and your saved bookmarks and notes. We don&apos;t sell this data.</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>3. Where it&apos;s stored</h2>
            <p>Account and study data is stored with Supabase, our database and authentication provider. [DRAFT — hosting region, backup policy, and data retention periods need confirmation before this section is final.]</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>4. Your choices</h2>
            <p>[DRAFT — the process for exporting or deleting your account and data will be described here once built and confirmed.]</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>5. Contact</h2>
            <p>[DRAFT — a support/contact address for privacy questions will be added here.]</p>
          </section>
        </div>
      </div>
    </div>
  );
}
