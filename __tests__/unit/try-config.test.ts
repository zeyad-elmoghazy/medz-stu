import { TRY_CONFIG } from '@/lib/try-config';
import { PAGES } from '@/lib/seo';
import sitemap from '@/app/sitemap';

describe('/try placeholders', () => {
  it('ships with no chapter chosen, so nothing is featured until the owner picks one', () => {
    expect(TRY_CONFIG.chapterId).toBeNull();
    expect(TRY_CONFIG.questionCount).toBeGreaterThan(0);
  });

  it('stays noindex and out of the sitemap while no chapter is chosen', () => {
    expect(PAGES['/try'].indexable).toBe(false);
    expect(sitemap().map((e) => e.url)).not.toContain('https://www.medizee.app/try');
  });
});
