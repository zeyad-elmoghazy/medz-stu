import { readFileSync } from 'fs';
import { join } from 'path';
import sitemap from '@/app/sitemap';
import { PAGES, SITE_URL, pageMetadata, type PagePath } from '@/lib/seo';

const paths = Object.keys(PAGES) as PagePath[];
const indexable = paths.filter((p) => PAGES[p].indexable);
const noindex = paths.filter((p) => !PAGES[p].indexable);

describe('seo page config', () => {
  it.each(paths)('%s has a title within 60 characters', (path) => {
    expect(PAGES[path].title.length).toBeGreaterThan(10);
    expect(PAGES[path].title.length).toBeLessThanOrEqual(60);
  });

  it.each(paths)('%s has a description of 100-160 characters', (path) => {
    expect(PAGES[path].description.length).toBeGreaterThanOrEqual(100);
    expect(PAGES[path].description.length).toBeLessThanOrEqual(160);
  });

  it('gives every page a unique title and description', () => {
    expect(new Set(paths.map((p) => PAGES[p].title)).size).toBe(paths.length);
    expect(new Set(paths.map((p) => PAGES[p].description)).size).toBe(paths.length);
  });
});

describe('pageMetadata', () => {
  it.each(paths)('%s has a self-referencing canonical', (path) => {
    expect(pageMetadata(path).alternates?.canonical).toBe(path);
  });

  it.each(indexable)('%s is left indexable (no robots override)', (path) => {
    expect(pageMetadata(path).robots).toBeUndefined();
  });

  it.each(noindex)('%s is noindex, follow', (path) => {
    expect(pageMetadata(path).robots).toEqual({ index: false, follow: true });
  });

  // A page-level openGraph replaces the root's file-based og:image, so
  // every nested page must list the image itself. `/` gets it from the
  // opengraph-image file convention and must not list it twice.
  it.each(paths.filter((p) => p !== '/'))('%s lists the og and twitter image itself', (path) => {
    const m = pageMetadata(path);
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: '/opengraph-image', width: 1200, height: 630 })]);
    expect(m.twitter?.images).toEqual([expect.objectContaining({ url: '/opengraph-image' })]);
  });

  it('/ leaves the image to the opengraph-image file convention', () => {
    // The key must be absent, not merely undefined — Next treats a
    // present-but-undefined `images` as an override and drops the image.
    const m = pageMetadata('/');
    expect(m.openGraph).not.toHaveProperty('images');
    expect(m.twitter).not.toHaveProperty('images');
  });
});

describe('sitemap', () => {
  const urls = sitemap().map((e) => e.url);

  it('lists every indexable page as an absolute https www URL', () => {
    expect(urls).toEqual(indexable.map((p) => (p === '/' ? SITE_URL : `${SITE_URL}${p}`)));
    for (const url of urls) expect(url).toMatch(/^https:\/\/www\.medizee\.app(\/|$)/);
  });

  it('omits every noindex page', () => {
    for (const path of noindex) expect(urls).not.toContain(`${SITE_URL}${path}`);
  });
});

describe('public/robots.txt', () => {
  const robots = readFileSync(join(process.cwd(), 'public/robots.txt'), 'utf8');
  const disallowed = robots
    .split('\n')
    .filter((l) => l.startsWith('Disallow:'))
    .map((l) => l.replace('Disallow:', '').trim());

  it('points at the sitemap', () => {
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('never blocks a page that relies on its noindex tag being seen', () => {
    for (const path of noindex) {
      expect(disallowed.some((d) => d !== '' && path.startsWith(d))).toBe(false);
    }
  });

  it('never blocks an indexable page', () => {
    for (const path of indexable) {
      expect(disallowed.some((d) => d !== '' && path.startsWith(d))).toBe(false);
    }
  });

  it('still blocks the authenticated areas', () => {
    expect(disallowed).toEqual(expect.arrayContaining(['/api/', '/admin/', '/student/', '/auth/']));
  });
});
