import type { Metadata } from 'next';
import { Inter, Caveat } from 'next/font/google';
import Script from 'next/script';
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
    'MediZee is an adaptive MCQ bank with instant split-view feedback, built by and for medical students.',
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
    <html
      lang="en"
      className={`${inter.variable} ${caveat.variable} dark`}
      // The inline script below mutates this element's data-mz-theme
      // attribute before React hydrates, so the live DOM legitimately
      // differs from what SSR rendered (React renders no such
      // attribute here at all). Confirmed via a real hydration
      // warning during verification without this — suppress it only
      // for that one, script-owned attribute; className above still
      // gets React's normal mismatch checking.
      suppressHydrationWarning
    >
      <head>
        {/* Sets html[data-mz-theme] from localStorage before first
            paint, so the theme-token blocks in globals.css resolve
            to the saved preference immediately instead of always
            painting dark first — the flash the landing page used
            to accept (see app/page.tsx's mount effect) is gone for
            every [data-mz-root] surface, landing and student alike.
            next/script's beforeInteractive strategy (not a plain
            <script> tag) is what Next.js documents for exactly this
            "must run before hydration" case — a raw <script> in JSX
            hits a real, verified-during-testing React dev warning
            ("Scripts inside React components are never executed
            when rendering on the client"); beforeInteractive doesn't.

            Falls back to medz.studentPrefs.theme (the profile page's
            old, pre-StudentThemeProvider preference blob) when
            mz-theme hasn't been set yet — same fallback order as the
            one-time migration in lib/use-student-theme.tsx's mount
            effect, just replicated here so a student who'd already
            flipped that old switch doesn't see a dark-then-light
            flash on their first load after this change. This script
            only reads the legacy value for this one paint; writing
            mz-theme from it is still the provider's job on mount. */}
        <Script
          id="mz-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('mz-theme');if(t!=='light'&&t!=='dark'){var raw=localStorage.getItem('medz.studentPrefs');if(raw){var legacy=JSON.parse(raw).theme;if(legacy==='light'||legacy==='dark')t=legacy;}}document.documentElement.dataset.mzTheme=(t==='light'||t==='dark')?t:'dark';}catch(e){document.documentElement.dataset.mzTheme='dark';}})();",
          }}
        />
      </head>
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
