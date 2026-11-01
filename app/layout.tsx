import type { Metadata } from 'next';
import { Public_Sans, Caveat } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { PAGES, SITE_NAME, SITE_URL } from '@/lib/seo';
import './globals.css';

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  // Only the two student quiz pages use `font-handwritten`. Without
  // this, every route — the public landing page included — preloaded
  // the font file for nothing. It still loads on demand when used.
  preload: false,
});

// Site-wide defaults. Public pages set their own full title,
// description and self-canonical through pageMetadata() in lib/seo.ts —
// deliberately NO `alternates.canonical` here: it would be inherited by
// every child route and point them all at `/`.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: PAGES['/'].title, template: `%s | ${SITE_NAME}` },
  description: PAGES['/'].description,
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
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
      className={`${publicSans.variable} ${caveat.variable}`}
      // The inline script below sets this element's data-mz-theme
      // attribute before React hydrates, so the live DOM legitimately
      // differs from what SSR rendered (React renders no such
      // attribute here at all). Suppress the hydration warning only
      // for that one, script-owned attribute; className above still
      // gets React's normal mismatch checking.
      suppressHydrationWarning
    >
      <head>
        {/* Sets html[data-mz-theme] from localStorage before first
            paint, so the theme-token blocks in globals.css resolve
            to the saved preference immediately instead of flashing
            the default first — covers every [data-mz-root] surface,
            landing and student alike. next/script's beforeInteractive
            strategy (not a plain <script> tag) is what Next.js
            documents for exactly this "must run before hydration"
            case — a raw <script> in JSX hits a real React dev warning
            ("Scripts inside React components are never executed
            when rendering on the client"); beforeInteractive doesn't.

            Falls back to medz.studentPrefs.theme (the profile page's
            old, pre-StudentThemeProvider preference blob) when
            mz-theme hasn't been set yet — same fallback order as the
            one-time migration in lib/use-student-theme.tsx's mount
            effect. Default (no saved preference at all) is now
            'light', matching the new near-white default surface. */}
        <Script
          id="mz-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('mz-theme');if(t!=='light'&&t!=='dark'){var raw=localStorage.getItem('medz.studentPrefs');if(raw){var legacy=JSON.parse(raw).theme;if(legacy==='light'||legacy==='dark')t=legacy;}}document.documentElement.dataset.mzTheme=(t==='light'||t==='dark')?t:'light';}catch(e){document.documentElement.dataset.mzTheme='light';}})();",
          }}
        />
      </head>
      <body
        data-mz-root
        className="min-h-screen bg-background text-text-primary"
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
