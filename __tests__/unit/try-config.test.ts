import { TRY_CONFIG, tryYears } from '@/lib/try-config';
import { PAGES } from '@/lib/seo';
import sitemap from '@/app/sitemap';
import { pickEvenly } from '@/lib/server/try-questions';

describe('/try config', () => {
  it('features 10 questions from one module in each year that has questions', () => {
    expect(TRY_CONFIG.questionCount).toBe(10);
    expect(tryYears()).toEqual([1, 2, 3]);
    for (const year of tryYears()) expect(TRY_CONFIG.modules[year]).toMatch(/^\d+$/);
  });

  it('is indexable and in the sitemap while at least one year is configured', () => {
    expect(PAGES['/try'].indexable).toBe(true);
    expect(sitemap().map((e) => e.url)).toContain('https://www.medizee.app/try');
  });
});

describe('tryYears', () => {
  it('lists configured years in order and skips empty ones', () => {
    expect(tryYears({ questionCount: 10, modules: { 3: '309', 1: '102', 2: null, 4: '' } })).toEqual([1, 3]);
  });

  it('is empty when nothing is configured (the page then shows "coming soon")', () => {
    expect(tryYears({ questionCount: 10, modules: {} })).toEqual([]);
  });
});

describe('pickEvenly', () => {
  const ids = Array.from({ length: 100 }, (_, i) => i);

  it('spreads the picks across the whole list, not just the start', () => {
    const picked = pickEvenly(ids, 10);
    expect(picked).toHaveLength(10);
    expect(picked[0]).toBeLessThan(10);
    expect(picked[9]).toBeGreaterThanOrEqual(90);
    expect(new Set(picked).size).toBe(10);
    expect([...picked].sort((a, b) => a - b)).toEqual(picked); // stays in order
  });

  it('returns everything when there are no more items than requested', () => {
    expect(pickEvenly([5, 6, 7], 10)).toEqual([5, 6, 7]);
    expect(pickEvenly([], 10)).toEqual([]);
  });

  it('returns nothing for a count of zero', () => {
    expect(pickEvenly(ids, 0)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(pickEvenly(ids, 10)).toEqual(pickEvenly(ids, 10));
  });
});
