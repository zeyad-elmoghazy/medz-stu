/**
 * Seed the curriculum taxonomy (subjects, modules, module_subjects,
 * chapters) from a JSON curriculum file into whichever Supabase
 * project the env vars point at.
 *
 * Idempotent — safe to re-run. Existing rows are left alone via
 * upsert(..., { ignoreDuplicates: true }), the JS-client equivalent
 * of INSERT ... ON CONFLICT DO NOTHING, matching the same composite
 * keys enforced everywhere else in this model (015_b2c_pivot_rebuild.sql):
 *   subjects.slug                          UNIQUE
 *   modules.code                           PRIMARY KEY
 *   module_subjects (module_code, subject_id)        PRIMARY KEY
 *   chapters (module_code, subject_id, slug)         UNIQUE
 *
 * Slug/ordinal logic mirrors the real POST route handlers exactly
 * (app/api/admin/content/{subjects,modules,modules/[code]/subjects,
 * chapters}/route.ts) so rows created here are indistinguishable
 * from rows an admin creates by hand through the UI.
 *
 * Usage:
 *   npm run seed:curriculum
 *   npm run seed:curriculum -- scripts/seed/some-other-curriculum.json
 *
 * Environment targeting — nothing in this file is hardcoded to one
 * Supabase project. It reads whichever project NEXT_PUBLIC_SUPABASE_URL
 * / SUPABASE_SERVICE_ROLE_KEY point at, so retargeting (MedZ-Stu →
 * launch DB → eventually meds-demo) is just a matter of which .env
 * file gets loaded:
 *   tsx --env-file=.env.local        scripts/seed/seed-curriculum.ts   # MedZ-Stu (dev)
 *   tsx --env-file=.env.launch       scripts/seed/seed-curriculum.ts   # launch DB, once it exists
 *   tsx --env-file=.env.meds-demo    scripts/seed/seed-curriculum.ts   # meds-demo, if/when this ever targets it
 * The target URL is printed before anything is written — read it
 * before letting the script continue.
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL      — the project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — service role key (bypasses RLS)
 *
 * JSON shape expected — top-level "modules" array; each entry has
 * "code", "year" (number), and a "subjects" map of subject name →
 * array of { name, topic?, note? }. A "topic" field has no column
 * in the current schema and is intentionally dropped — this script
 * logs every chapter that had one, so nothing goes missing silently.
 * An "excluded_this_pass" key alongside "modules" is informational
 * only; anything not in the "modules" array is skipped automatically.
 *
 * NOT included here: cleanup of pre-existing placeholder/mislabeled
 * chapter rows. That was a one-time fix for junk data specific to
 * MedZ-Stu (left over from an earlier session's scaffolding) — see
 * scripts/seed/cleanup-legacy-placeholder-chapters.ts, a separate,
 * explicitly opt-in script. A freshly provisioned database seeded
 * straight from this script won't have that junk and doesn't need it.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

type JsonChapter = { name: string; topic?: string; note?: string };
type JsonModule = { code: string; year: number; subjects: Record<string, JsonChapter[]> };
type CurriculumFile = { modules: JsonModule[]; excluded_this_pass?: unknown };

// Matches POST /api/admin/content/subjects' slug computation exactly
// (app/api/admin/content/subjects/route.ts) — whitespace collapsed
// to hyphens, nothing else stripped. Deliberately not "improved"
// here; a subject seeded by this script must slug identically to
// one created by hand through the admin UI, or the two would drift
// into duplicate rows on a future re-run.
function subjectSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

// Matches POST /api/admin/content/chapters' slug computation exactly
// (app/api/admin/content/chapters/route.ts).
function chapterSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// New modules absent from the DB, and this JSON format only ever
// carries code + year (no title) — CreateModuleSchema requires
// `name`, so something has to fill it. Matches the placeholder
// convention already present in the DB for modules created without
// a real title yet (102/108/208 are literally named "Module 102"
// etc.) rather than inventing a new pattern. A human renames these
// later via the admin UI once the real module title is known.
function placeholderModuleName(code: string): string {
  return `Module ${code}`;
}

async function main(): Promise<void> {
  const jsonPath = resolve(process.argv[2] ?? 'scripts/seed/medizee-curriculum-seed.json');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Fail loud — silent env misses are exactly how a "seed" ends up
    // pointing at the wrong project.
    throw new Error(
      'seed-curriculum: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  // Printed first and loudly: this is the only thing standing between
  // "seeded the intended DB" and "seeded the wrong one" — read it
  // before the writes below happen.
  console.log(`seed-curriculum: targeting ${url}`);
  console.log(`seed-curriculum: reading ${jsonPath}`);

  const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as CurriculumFile;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 1. Subjects — global catalog, reused across modules. Upsert
  // by slug so a subject already in the catalog is never duplicated,
  // matching the architecture note: one row per subject name, no
  // matter how many modules reference it. ---
  const subjectNames = new Set<string>();
  for (const m of data.modules) {
    for (const name of Object.keys(m.subjects)) subjectNames.add(name);
  }
  const subjectRows = Array.from(subjectNames).map((name) => ({
    slug: subjectSlug(name),
    name,
  }));
  {
    const { error, count } = await supabase
      .from('subjects')
      .upsert(subjectRows, { onConflict: 'slug', ignoreDuplicates: true, count: 'exact' });
    if (error) throw new Error(`seed-curriculum: subjects upsert failed: ${error.message}`);
    console.log(
      `seed-curriculum: subjects — ${subjectRows.length} in file, ${count ?? '?'} newly written.`
    );
  }

  // Re-fetch the full id map — upsert with ignoreDuplicates doesn't
  // return ids for rows that already existed, and every later step
  // needs every subject's id regardless of whether it was just
  // created here or already present.
  const { data: subjectsInDb, error: subjErr } = await supabase
    .from('subjects')
    .select('id, name');
  if (subjErr) throw new Error(`seed-curriculum: failed to read subjects back: ${subjErr.message}`);
  const subjectIdByName = new Map<string, string>(
    (subjectsInDb ?? []).map((s: { id: string; name: string }) => [s.name, s.id])
  );

  // --- 2. Modules — create if missing. Existing modules' name/
  // year_num/year_label are left untouched (ignoreDuplicates skips
  // the row entirely on conflict) — this only fills gaps, never
  // overwrites a title an admin may have already set by hand. ---
  const moduleRows = data.modules.map((m) => ({
    code: m.code,
    name: placeholderModuleName(m.code), // only takes effect if the module doesn't already exist
    year_num: String(m.year),
    // Generic fallback ("Year N"). Existing modules use a richer,
    // hand-set label ("Preclinical · Foundations" / "· Systems") —
    // this script has no way to know that convention for a year it's
    // never seen a module in (e.g. year 3), so it doesn't guess one.
    // A human can upgrade the label later via the admin UI.
    year_label: `Year ${m.year}`,
    is_active: true,
    subject_id: 'multi', // legacy column, superseded by module_subjects (015_b2c_pivot_rebuild.sql)
  }));
  {
    const { error, count } = await supabase
      .from('modules')
      .upsert(moduleRows, { onConflict: 'code', ignoreDuplicates: true, count: 'exact' });
    if (error) throw new Error(`seed-curriculum: modules upsert failed: ${error.message}`);
    console.log(
      `seed-curriculum: modules — ${moduleRows.length} in file, ${count ?? '?'} newly written.`
    );
  }

  // --- 3. module_subjects — the join table a module's subjects
  // actually live in. ---
  const pairRows: { module_code: string; subject_id: string }[] = [];
  for (const m of data.modules) {
    for (const name of Object.keys(m.subjects)) {
      const subjectId = subjectIdByName.get(name);
      if (!subjectId) {
        throw new Error(`seed-curriculum: subject "${name}" missing after upsert — should be unreachable`);
      }
      pairRows.push({ module_code: m.code, subject_id: subjectId });
    }
  }
  {
    const { error, count } = await supabase
      .from('module_subjects')
      .upsert(pairRows, { onConflict: 'module_code,subject_id', ignoreDuplicates: true, count: 'exact' });
    if (error) throw new Error(`seed-curriculum: module_subjects upsert failed: ${error.message}`);
    console.log(
      `seed-curriculum: module_subjects — ${pairRows.length} in file, ${count ?? '?'} newly written.`
    );
  }

  // --- 4. Chapters — scoped to (module_code, subject_id). Ordinal
  // is auto-computed per group, continuing from whatever's already
  // there, matching POST /api/admin/content/chapters' "max ordinal
  // + 1" logic — just computed once per group up front instead of
  // once per HTTP call. ---
  const { data: existingChapters, error: chErr } = await supabase
    .from('chapters')
    .select('module_code, subject_id, slug, ordinal');
  if (chErr) throw new Error(`seed-curriculum: failed to read existing chapters: ${chErr.message}`);

  const groupKey = (moduleCode: string, subjectId: string) => `${moduleCode} ${subjectId}`;

  const maxOrdinal = new Map<string, number>();
  const existingSlugs = new Set<string>();
  for (const c of (existingChapters ?? []) as { module_code: string; subject_id: string; slug: string; ordinal: number }[]) {
    const key = groupKey(c.module_code, c.subject_id);
    maxOrdinal.set(key, Math.max(maxOrdinal.get(key) ?? 0, c.ordinal));
    existingSlugs.add(`${key} ${c.slug}`);
  }

  const droppedTopics: { module: string; subject: string; name: string; topic: string }[] = [];
  const chapterRows: { module_code: string; subject_id: string; slug: string; name: string; ordinal: number }[] = [];
  const seenThisRun = new Set<string>();

  for (const m of data.modules) {
    for (const [subjectName, chapters] of Object.entries(m.subjects)) {
      const subjectId = subjectIdByName.get(subjectName);
      if (!subjectId) {
        throw new Error(`seed-curriculum: subject "${subjectName}" missing after upsert — should be unreachable`);
      }
      const key = groupKey(m.code, subjectId);

      for (const c of chapters) {
        const name = c.name.trim();
        const slug = chapterSlug(name);
        const slugKey = `${key} ${slug}`;

        if (c.topic) {
          // No column for this in the current schema — intentionally
          // not stored anywhere. Logged below so it's never a silent
          // data loss, just a documented one.
          droppedTopics.push({ module: m.code, subject: subjectName, name, topic: c.topic });
        }

        if (existingSlugs.has(slugKey) || seenThisRun.has(slugKey)) {
          continue; // true duplicate — the (module_code, subject_id, slug) constraint would reject this anyway
        }
        seenThisRun.add(slugKey);

        const nextOrdinal = (maxOrdinal.get(key) ?? 0) + 1;
        maxOrdinal.set(key, nextOrdinal);
        chapterRows.push({ module_code: m.code, subject_id: subjectId, slug, name, ordinal: nextOrdinal });
      }
    }
  }

  {
    const { error, count } = await supabase
      .from('chapters')
      .upsert(chapterRows, {
        onConflict: 'module_code,subject_id,slug',
        ignoreDuplicates: true,
        count: 'exact',
      });
    if (error) throw new Error(`seed-curriculum: chapters upsert failed: ${error.message}`);
    console.log(
      `seed-curriculum: chapters — ${chapterRows.length} computed as new, ${count ?? '?'} newly written.`
    );
  }

  console.log(
    `seed-curriculum: done. ${droppedTopics.length} chapter(s) had a "topic" field dropped (no schema home for it).`
  );
  if (droppedTopics.length > 0) {
    console.log('seed-curriculum: dropped topics —');
    for (const d of droppedTopics) {
      console.log(`  [${d.module}] ${d.subject} / "${d.name}" — topic: "${d.topic}"`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
