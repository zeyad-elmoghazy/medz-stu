/**
 * The public /try page: for each academic year, `questionCount` real questions
 * sampled from ONE module, answerable without an account and ending in a
 * "create your free account" prompt.
 *
 * `modules` maps an academic year (1-5) to the module code to sample from.
 * A year with no entry (or null) is simply not offered; with none at all the
 * page shows a short "coming soon", is marked noindex and stays out of the
 * sitemap (see lib/seo.ts). To change what visitors see, change the module
 * codes here: the questions themselves are picked on the server (spread
 * evenly across the module's published questions) and refreshed hourly.
 *
 * Years 4 and 5 have no published questions yet, so they are not listed.
 */
export type TryConfig = {
  questionCount: number;
  modules: Partial<Record<number, string | null>>;
};

export const TRY_CONFIG: TryConfig = {
  questionCount: 10,
  modules: {
    1: '102', // INT-102
    2: '205', // Central Nervous System
    3: '309', // Module 309
  },
};

/** The academic years /try offers, in order. */
export function tryYears(config: TryConfig = TRY_CONFIG): number[] {
  return Object.entries(config.modules)
    .filter(([, code]) => !!code)
    .map(([year]) => Number(year))
    .filter((year) => Number.isInteger(year))
    .sort((a, b) => a - b);
}
