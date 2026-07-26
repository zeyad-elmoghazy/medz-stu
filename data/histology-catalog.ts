// =============================================================
// Histology catalog — modules grouped by academic year, each
// with its list of chapters. Ported from the design mock in
// `MedZ Home.dc.html` → `academicYears`. Chapter progress here
// is the DEMO default only; real per-user progress is read from
// localStorage via `lib/chapter-progress`.
// =============================================================

export type Chapter = {
  id: string;               // slug used in URLs + localStorage keys
  name: string;
  defaultProgress: number;  // 0..100 — the mock value shown until the user starts
  published: boolean;       // false until the professor publishes questions;
                            // locked chapters ignore progress / hide the quiz link
};

export type Module = {
  code: string;             // "101" — combined with subject prefix in the UI ("HIST 101")
  name: string;
  qs: number;               // question count
  chapters: Chapter[];
};

export type AcademicYear = {
  year: string;             // "1st Year"
  label: string;            // "Preclinical · Foundations"
  yearNum: string;          // "1"
  modules: Module[];
};

// A tiny slug helper — deterministic, ASCII-only. The catalog is
// static so we can compute IDs at module load time (below).
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function ch(name: string, defaultProgress: number, published = false): Chapter {
  return { id: slug(name), name, defaultProgress, published };
}

// ponytail: qs=0 and defaultProgress=0 everywhere. Live counts
// come from /api/professor/modules → chapters.published_count.
// The static catalog is now shape + names only; every number
// starts at zero and increments when a professor publishes.
export const HISTOLOGY_ACADEMIC_YEARS: AcademicYear[] = [
  {
    year: '1st Year', label: 'Preclinical · Foundations', yearNum: '1',
    modules: [
      { code: '101', name: 'General Histology & The Cell', qs: 0, chapters: [
        ch('Cytology', 0),
        ch('Connective Tissue', 0),
        ch('Epithelium', 0),
        ch('Blood', 0),
      ] },
      { code: '103', name: 'Epithelial & Connective Tissue', qs: 0, chapters: [
        ch('Cartilage', 0),
        ch('Bone', 0),
        ch('Muscle', 0),
        ch('Skin', 0),
      ] },
      { code: '104', name: 'Blood & Muscle Tissue', qs: 0, chapters: [
        ch('Lymphatics', 0),
        ch('Vascular', 0),
        ch('Respiratory', 0),
        ch('Cytogenetics', 0),
      ] },
    ],
  },
  {
    year: '2nd Year', label: 'Preclinical · Systems', yearNum: '2',
    modules: [
      { code: '205', name: 'Nervous & Cardiovascular Systems', qs: 0, chapters: [
        ch('Nervous Tissue', 0),
        ch('Central Nervous System', 0),
        ch('Eye', 0),
        ch('Ear', 0),
      ] },
      { code: '206', name: 'Lymphoid & Endocrine Systems', qs: 0, chapters: [
        ch('Digestive Tract', 0),
        ch('Digestive Glands', 0),
        ch('Urinary System', 0),
      ] },
      { code: '207', name: 'Respiratory & Digestive Systems', qs: 0, chapters: [
        ch('Endocrine System', 0),
        ch('Male Reproductive System', 0),
        ch('Female Reproductive System', 0),
      ] },
    ],
  },
];

// Flat lookup helpers — cheap enough to compute at module load.
const MODULE_INDEX = new Map<string, { module: Module; year: AcademicYear }>();
HISTOLOGY_ACADEMIC_YEARS.forEach((y) => {
  y.modules.forEach((m) => MODULE_INDEX.set(m.code, { module: m, year: y }));
});

export function findModule(code: string): { module: Module; year: AcademicYear } | null {
  return MODULE_INDEX.get(code) ?? null;
}

// Design's HIST subject prefix — kept here so both pages read
// the same source when they render "HIST 101" style badges.
export const HISTOLOGY_SUBJECT_PREFIX = 'HIST';
