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
