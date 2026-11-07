/**
 * Shared constants for the student Catalogue (/student/catalogue/*).
 *
 * Year labels are a fixed 3-value curriculum enum, not derived from
 * any individual module's own year_label column — that column is
 * inconsistent across modules in the same year (e.g. year 2 has both
 * "Preclinical · Systems" on its original modules and the generic
 * "Year 2" placeholder on module 210, seeded later with no real
 * title yet). Picking "any module's year_label" would be arbitrary;
 * this fixed map is what the mockup itself hardcodes and is stable
 * regardless of per-module data quality.
 */
export const YEAR_LABELS: Record<number, string> = {
  1: 'Preclinical · Foundations',
  2: 'Preclinical · Systems',
  3: 'Clinical Sciences',
};

/**
 * Where "Back" should land after a chapter quiz: the subject page the
 * chapter was opened from, falling back to its module page, then the
 * catalogue root. Pure, so the route and client code share one answer.
 */
export function chapterBackHref(parts: {
  yearNum?: string | number | null;
  moduleCode?: string | null;
  subjectSlug?: string | null;
}): string {
  const year = parts.yearNum == null ? '' : String(parts.yearNum).trim();
  const moduleCode = parts.moduleCode?.trim();
  if (!year || !moduleCode) return '/student/catalogue';
  const moduleHref = `/student/catalogue/${encodeURIComponent(year)}/${encodeURIComponent(moduleCode)}`;
  const slug = parts.subjectSlug?.trim();
  return slug ? `${moduleHref}/${encodeURIComponent(slug)}` : moduleHref;
}
