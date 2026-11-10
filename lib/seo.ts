import type { Metadata } from 'next';
import { tryYears } from '@/lib/try-config';

// Canonical production origin. Every canonical, sitemap entry, OG url
// and JSON-LD url is built from this — `www` is the primary host (the
// apex 308-redirects to it at the Vercel domain level).
export const SITE_URL = 'https://www.medizee.app';
export const SITE_NAME = 'MediZee';

type PageSeo = {
  /** Final <title>, used verbatim (title.absolute). */
  title: string;
  description: string;
  /** false → `noindex, follow`, and the page is left out of the sitemap. */
  indexable: boolean;
};

// One entry per public, crawlable route. Authenticated areas
// (/student, /admin, /api) are blocked in public/robots.txt instead —
// a noindex there could never be seen by a crawler that can't fetch it.
//
// /privacy and /terms are noindex while their copy is still marked
// "Draft — pending legal review"; flip `indexable` once it is final.
// /forgot-password and /reset-password have no search value (the
// latter is token-driven), so they stay out of the index permanently.
export const PAGES = {
  '/': {
    title: 'MediZee — Medical MCQ Question Bank for Exam Prep',
    description:
      'Practice a full medical MCQ bank with instant split-view feedback, analytics and study streaks. Free for now, built by and for medical students.',
    indexable: true,
  },
  '/signup': {
    title: 'Create your free account | MediZee',
    description:
      'Create your free MediZee account to practice medical MCQs, track your accuracy and keep a daily study streak. No card required.',
    indexable: true,
  },
  '/login': {
    title: 'Log in | MediZee',
    description:
      'Log in to your MediZee account to continue your medical MCQ practice, re-quiz your mistakes and keep your daily study streak going.',
    indexable: true,
  },
  // Indexable only once lib/try-config.ts lists at least one module to sample;
  // until then the page is a "coming soon" and stays out of the index and sitemap.
  '/try': {
    title: 'Try 10 medical MCQs free, no signup | MediZee',
    description:
      'Answer ten real medical MCQs from your year with instant explanations, no account needed. See how MediZee works, then create your free account.',
    indexable: tryYears().length > 0,
  },
  '/forgot-password': {
    title: 'Reset your password | MediZee',
    description:
      'Forgot your MediZee password? Enter your email and we will send you a secure link to reset it and get back to your practice.',
    indexable: false,
  },
  '/reset-password': {
    title: 'Choose a new password | MediZee',
    description:
      'Choose a new password for your MediZee account using the secure link from your email, then get back to practicing medical MCQs.',
    indexable: false,
  },
  '/privacy': {
    title: 'Privacy Policy — MediZee',
    description:
      'Draft privacy policy describing how MediZee collects and uses your account details, quiz activity, bookmarks and notes. Pending legal review.',
    indexable: false,
  },
  '/terms': {
    title: 'Terms of Service — MediZee',
    description:
      'Draft terms of service for using MediZee, the medical MCQ practice platform. Pending legal review and not yet a binding agreement.',
    indexable: false,
  },
} as const satisfies Record<string, PageSeo>;

export type PagePath = keyof typeof PAGES;

// Served by app/opengraph-image.tsx. Keep `alt` in sync with that file's
// own `alt` export (it must stay a literal there for Next to read it).
const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'MediZee — Medical MCQ question bank for exam prep',
};

/**
 * Metadata for one public page: unique title/description, a
 * self-referencing canonical, and `noindex` where the page is not meant
 * to be indexed.
 *
 * openGraph/twitter are restated in full because a page-level
 * `openGraph` replaces the root one rather than merging into it — and
 * that includes the file-based og:image from app/opengraph-image.tsx,
 * which is why the image is listed explicitly here (the landing page,
 * which sits in the same segment as that file, still gets it from the
 * file convention and must not list it twice).
 */
export function pageMetadata(path: PagePath): Metadata {
  const { title, description, indexable }: PageSeo = PAGES[path];
  // Spread, don't assign `images: undefined`: Next treats a present key
  // as an override even when its value is undefined, which would drop
  // the file-convention image on `/`.
  const image = path === '/' ? {} : { images: [OG_IMAGE] };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: path,
      title,
      description,
      ...image,
    },
    twitter: { card: 'summary_large_image', title, description, ...image },
  };
}
