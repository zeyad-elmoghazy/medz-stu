import type { MetadataRoute } from 'next';
import { PAGES, SITE_URL, type PagePath } from '@/lib/seo';

// Only indexable public pages. noindex pages (legal drafts, password
// reset) are deliberately absent: a sitemap entry for a noindex URL is
// a contradictory signal. Derived from lib/seo.ts so the two can't drift.
export default function sitemap(): MetadataRoute.Sitemap {
  return (Object.keys(PAGES) as PagePath[])
    .filter((path) => PAGES[path].indexable)
    .map((path) => ({ url: path === '/' ? SITE_URL : `${SITE_URL}${path}` }));
}
