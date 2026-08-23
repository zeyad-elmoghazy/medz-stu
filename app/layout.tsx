import type { Metadata } from 'next';
import { Inter, Caveat } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MediZee — Adaptive medical learning',
  description:
    'MediZee is an adaptive MCQ bank, mock-exam generator, flashcard deck, and AI tutor built by and for medical students.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable} dark`}>
      <body className="min-h-screen bg-background text-text-primary">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 grid-pattern opacity-40" />
          <div className="absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-accent/20 blur-[160px]" />
          <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-success/10 blur-[160px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
