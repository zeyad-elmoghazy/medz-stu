'use client';

export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
        Something went wrong loading this page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }}
      >
        Try again
      </button>
    </main>
  );
}
