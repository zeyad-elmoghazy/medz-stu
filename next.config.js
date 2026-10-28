/** @type {import('next').NextConfig} */

// =============================================
// SECURITY HEADERS
// =============================================
// Applied to every response via the headers() hook below. Each
// entry hardens a specific browser surface — kept here so the
// config block is single-source-of-truth instead of split between
// next.config.js and middleware.
const isDev = process.env.NODE_ENV !== 'production';

// Pin the CSP (and next/image) to OUR Supabase project instead of
// every *.supabase.co tenant — otherwise any attacker-owned Supabase
// project is a valid exfiltration target. Falls back to the wildcard
// only if the env var is unset/invalid (the app can't boot then anyway).
let supabaseOrigin = null;
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
} catch {
  /* env not set at config-load time */
}
const supabaseConnect = supabaseOrigin
  ? [supabaseOrigin, supabaseOrigin.replace(/^http/, 'ws')]
  : ['https://*.supabase.co', 'wss://*.supabase.co'];

const securityHeaders = [
  // HSTS — force HTTPS for 2 years, include subdomains. Only
  // applies after the first https hit; harmless on http localhost.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // No clickjacking. We never iframe ourselves.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Don't let the browser guess content types.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Keep referrer minimal across origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down powerful APIs the app doesn't use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Isolate our browsing context from cross-origin windows.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Restrict cross-origin script loading. Next inlines a little script
  // for hydration, so 'unsafe-inline' stays until we move to CSP
  // nonces — which force every page to render dynamically (no static
  // landing page), so it is a deliberate trade-off, not an oversight.
  // 'unsafe-eval' is dev-only: React uses eval for debug stacks, but
  // neither React nor Next does in production.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ' https://*.supabase.co'}`,
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseConnect.join(' ')}`,
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(isDev ? [] : ['upgrade-insecure-requests']),
    ].join('; '),
  },
];

// =============================================
// BUNDLE ANALYZER (opt-in)
// =============================================
// Run with: ANALYZE=true npm run build
// Falls back to a no-op wrapper if @next/bundle-analyzer is not
// installed — keeps `next build` working in any environment.
let withBundleAnalyzer = (config) => config;
if (process.env.ANALYZE === 'true') {
  try {
    withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
  } catch {
    console.warn(
      '[next.config] ANALYZE=true but @next/bundle-analyzer is not installed. ' +
        'Run: npm install -D @next/bundle-analyzer'
    );
  }
}

const nextConfig = {
  // Pin the Turbopack workspace root to this project. Without this,
  // Next infers the root from the nearest lockfile upward and can
  // land on a parent directory (e.g. a stray lockfile on ~/Desktop),
  // which makes the dev server watch every sibling project's
  // node_modules and peg the CPU.
  turbopack: {
    root: __dirname,
  },

  // Compress all responses (gzip on the Next.js server; Vercel's
  // edge layer also brotli-compresses on top of this in prod).
  compress: true,

  // Modularize barrel imports so `import { Foo } from 'lucide-react'`
  // pulls just Foo, not every icon in the library. Same for framer /
  // radix — huge wins on First Load JS.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-slot',
    ],
  },

  // Server-only Node deps that must NOT enter the webpack graph:
  // - pdfjs-dist ships worker files with `import.meta` that
  //   Terser can't process.
  // - pdf-parse loads it dynamically at runtime.
  // - tesseract.js spawns a Node worker via require.resolve; if
  //   webpack rewrites its paths the worker can't find its own
  //   worker-script/node/index.js at runtime.
  // - sharp is a native binary — never bundle.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'tesseract.js', 'sharp'],

  // Drop console.* calls (except errors/warnings) from prod builds.
  // Saves bytes and eliminates main-thread work from log statements.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  // Turn off Next's own "Powered-By" header — one fewer byte per
  // response and one less server signature to fingerprint.
  poweredByHeader: false,

  // Skip generating source maps in production. Cuts build time and
  // avoids leaking source files. Re-enable if you need Sentry-style
  // stack-trace symbolication.
  productionBrowserSourceMaps: false,

  // Optimize images via Vercel's CDN
  images: {
    // Only our own Supabase project may be proxied through the image
    // optimizer (a wildcard host made it an open fetch-proxy for any
    // Supabase tenant). Falls back to the wildcard only if env is unset.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseOrigin ? new URL(supabaseOrigin).hostname : '*.supabase.co',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    // Cache images for 1 year on CDN
    minimumCacheTTL: 31536000,
    // Limit image sizes to prevent abuse — Next will reject any
    // requested width outside these lists, so an attacker can't
    // ask for /_next/image?w=99999 to burn transform compute.
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Enable React strict mode for better
  // error catching in development
  reactStrictMode: true,

  // The legacy Subjects flow (a static, Histology-only catalogue) was
  // superseded by the DB-backed Catalogue and its route files are gone;
  // this redirect keeps old bookmarks/links landing somewhere useful.
  async redirects() {
    return [
      {
        source: '/student/subjects/:path*',
        destination: '/student/catalogue',
        permanent: false,
      },
      // /admin/dashboard was retired for /admin/content; bare /admin never
      // had a page. Both 404'd for signed-in admins with old bookmarks.
      {
        source: '/admin',
        destination: '/admin/content',
        permanent: false,
      },
      {
        source: '/admin/dashboard',
        destination: '/admin/content',
        permanent: false,
      },
    ];
  },

  // Headers for caching static assets + security
  async headers() {
    return [
      {
        // Brand/subject art in public/ — not all filenames are versioned,
        // so revalidate daily instead of marking immutable.
        source: '/:file(medizee-logo.webp|favicon.png|dr-zahra.jpg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/subjects/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        // Never cache auth endpoints
        source: '/api/auth/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      // Security headers on every route.
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
