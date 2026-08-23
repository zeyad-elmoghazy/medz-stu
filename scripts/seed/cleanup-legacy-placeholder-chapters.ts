/**
 * ONE-TIME, SITUATIONAL cleanup — NOT part of the reusable seed path
 * (scripts/seed/seed-curriculum.ts) and not meant to run against
 * every environment automatically.
 *
 * Fixes junk data found specifically on MedZ-Stu on 2026-08-24:
 *   - generic "Chapter N" placeholder rows (scaffolding from an
 *     earlier session, not real curriculum content)
 *   - three fake "topic header" rows under module 205/Anatomy
 *     (Neuroanatomy/Head/Neck stored as if they were chapters,
 *     instead of the 39 real granular chapters those topics group)
 *   - six chapters mislabeled to the wrong subject under module 206
 *     (Anatomy and Physiology both held Histology's chapter names)
 *
 * A freshly provisioned database (launch DB, meds-demo if this ever
 * targets it) is seeded straight from seed-curriculum.ts and will
 * never accumulate this specific junk — it has no need for this
 * script. Only run this if you've independently confirmed a target
 * database has the same kind of pre-existing scaffolding.
 *
 * Safety:
 *   - Defaults to a DRY RUN — prints exactly what it would delete
 *     and exits without deleting. Pass --execute to actually delete.
 *   - Matching is by pattern (generic-name regex + a short list of
 *     known mislabeled module/subject/slug combos), not hardcoded
 *     row ids — those wouldn't be portable to a different database
 *     anyway. This makes the script legible if ever pointed at
 *     another project, but it was written against MedZ-Stu's
 *     specific junk shape, not as a general-purpose rule. Always
 *     read the dry-run output before passing --execute, even if
 *     you've run this before.
 *   - Before deleting, re-checks (live, not cached) that no rows in
 *     `questions` or `upload_jobs` reference the matched chapter ids
 *     — both are ON DELETE SET NULL, so nothing would hard-fail, but
 *     silently nulling out a real question's chapter link is exactly
 *     the kind of thing this check exists to catch. Refuses to
 *     delete if either is non-empty.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed/cleanup-legacy-placeholder-chapters.ts             # dry run
 *   tsx --env-file=.env.local scripts/seed/cleanup-legacy-placeholder-chapters.ts --execute    # actually deletes
 *
 * Env required: same as seed-curriculum.ts.
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const GENERIC_PLACEHOLDER = /^Chapter \d+$/;

const KNOWN_MISLABELED: { module_code: string; subject_name: string; slugs: string[] }[] = [
  { module_code: '205', subject_name: 'Anatomy', slugs: ['neuroanatomy', 'head', 'neck'] },
  {
    module_code: '206',
    subject_name: 'Anatomy',
    slugs: ['digestive-tract', 'digestive-glands', 'urinary-system'],
  },
  {
    module_code: '206',
    subject_name: 'Physiology',
    slugs: ['digestive-tract', 'digestive-glands', 'urinary-system'],
  },
  {
    module_code: '207',
    subject_name: 'Histology',
    slugs: ['endocrine-system', 'male-reproductive-system', 'female-reproductive-system'],
  },
];

type ChapterRow = {
  id: string;
  module_code: string;
  subject_id: string;
  slug: string;
  name: string;
  subjects: { name: string } | { name: string }[] | null;
};

function subjectNameOf(row: ChapterRow): string | undefined {
  const s = row.subjects;
  if (!s) return undefined;
  return Array.isArray(s) ? s[0]?.name : s.name;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'cleanup-legacy-placeholder-chapters: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  console.log(`cleanup-legacy-placeholder-chapters: targeting ${url}`);
  console.log(
    `cleanup-legacy-placeholder-chapters: mode = ${execute ? 'EXECUTE (will delete)' : 'dry run (no changes)'}`
  );

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: chapters, error } = await supabase
    .from('chapters')
    .select('id, module_code, subject_id, slug, name, subjects(name)');
  if (error) {
    throw new Error(`cleanup-legacy-placeholder-chapters: failed to read chapters: ${error.message}`);
  }

  const matches = ((chapters ?? []) as ChapterRow[]).filter((c) => {
    if (GENERIC_PLACEHOLDER.test(c.name)) return true;
    const subjectName = subjectNameOf(c);
    return KNOWN_MISLABELED.some(
      (k) => k.module_code === c.module_code && k.subject_name === subjectName && k.slugs.includes(c.slug)
    );
  });

  if (matches.length === 0) {
    console.log('cleanup-legacy-placeholder-chapters: no matching rows found — nothing to do.');
    return;
  }

  console.log(`cleanup-legacy-placeholder-chapters: ${matches.length} matching row(s):`);
  for (const m of matches) {
    console.log(`  [${m.module_code}] ${subjectNameOf(m)} / "${m.name}" (${m.slug}) — id ${m.id}`);
  }

  if (!execute) {
    console.log(
      '\ncleanup-legacy-placeholder-chapters: dry run only — re-run with --execute to delete these rows.'
    );
    return;
  }

  const ids = matches.map((m) => m.id);
  const [{ count: qCount, error: qErr }, { count: ujCount, error: ujErr }] = await Promise.all([
    supabase.from('questions').select('id', { count: 'exact', head: true }).in('chapter_id', ids),
    supabase.from('upload_jobs').select('id', { count: 'exact', head: true }).in('chapter_id', ids),
  ]);
  if (qErr) throw new Error(`cleanup-legacy-placeholder-chapters: dependency check (questions) failed: ${qErr.message}`);
  if (ujErr) throw new Error(`cleanup-legacy-placeholder-chapters: dependency check (upload_jobs) failed: ${ujErr.message}`);
  if ((qCount ?? 0) > 0 || (ujCount ?? 0) > 0) {
    throw new Error(
      `cleanup-legacy-placeholder-chapters: refusing to delete — ${qCount ?? 0} question(s) and ${ujCount ?? 0} upload_job(s) reference these chapters. Investigate before proceeding.`
    );
  }

  const { error: delError, count } = await supabase.from('chapters').delete({ count: 'exact' }).in('id', ids);
  if (delError) throw new Error(`cleanup-legacy-placeholder-chapters: delete failed: ${delError.message}`);

  console.log(`cleanup-legacy-placeholder-chapters: deleted ${count ?? matches.length} row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
