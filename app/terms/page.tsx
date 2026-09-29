import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — MediZee',
};

export default function TermsPage() {
  return (
    <div data-mz-root style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)' }}>← Back to MediZee</Link>
        <h1 style={{ margin: '24px 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: 'var(--faint)' }}>
          Draft — pending legal review. Not yet a binding agreement. Last edited 2026-09-27.
        </p>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24, fontSize: 15, lineHeight: 1.7, color: 'var(--text2)' }}>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>1. What MediZee is</h2>
            <p>MediZee is a study platform for medical students: a multiple-choice question bank organized by year, module, subject, and chapter, with instant feedback, self-generated practice exams, bookmarks and notes, and personal analytics.</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>2. Accounts</h2>
            <p>You need an account to answer questions, track progress, or save bookmarks and notes. You are responsible for the accuracy of the information you provide and for keeping your account credentials secure.</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>3. Content and academic use</h2>
            <p>Question content, explanations, and reference material on MediZee are provided for personal exam preparation. [DRAFT — the specific rules on redistribution, sourcing of question content, and citation of course material need legal and academic-integrity review before this section is final.]</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>4. Pricing</h2>
            <p>MediZee is currently free to use during its demo phase, as stated on the pricing section of the homepage. [DRAFT — terms for any future paid tier, refunds, and cancellation will be added here once pricing is finalized.]</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>5. Changes</h2>
            <p>[DRAFT — notice period and process for changes to these terms, and for account suspension or termination, pending legal review.]</p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>6. Contact</h2>
            <p>[DRAFT — a support/contact address will be added here.]</p>
          </section>
        </div>
      </div>
    </div>
  );
}
