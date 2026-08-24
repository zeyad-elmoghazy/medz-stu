import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { YEAR_LABELS } from '@/lib/catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/catalogue/modules-by-year
 *
 * Every module, grouped by year, with the Year-level aggregate stats
 * (modules / distinct subjects / chapters) the Catalogue's Years
 * screen needs. Auth: any signed-in user — same "if (!user) only,
 * no role restriction" pattern as /api/student/stats. This is
 * read-only curriculum structure, not a student's own data.
 *
 * Aggregation, verified against MedZ-Stu before writing this route:
 *   modules  per year = count of modules where year_num matches
 *   chapters per year = count of chapters whose module_code belongs
 *                        to that year (direct FK, no join needed)
 *   subjects per year = COUNT(DISTINCT subject_id) among
 *                        module_subjects rows for that year's
 *                        modules — NOT a flat platform-wide subject
 *                        count (8), and NOT scoped on the subjects
 *                        table itself (subjects have no year column;
 *                        the same subject legitimately appears
 *                        across multiple years' modules).
 * Confirmed exact match to the real seed: Year 1 5/6/62, Year 2
 * 5/6/100, Year 3 2/4/79, totals 12/8/241.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = untypedFrom(supabase);

  const [modulesRes, moduleSubjectsRes, chaptersRes, subjectsRes] = await Promise.all([
    client.from('modules').select('code, name, year_num').order('code', { ascending: true }),
    client.from('module_subjects').select('module_code, subject_id'),
    client.from('chapters').select('module_code, subject_id, published_count'),
    client.from('subjects').select('id, name'),
  ]);

  for (const res of [modulesRes, moduleSubjectsRes, chaptersRes, subjectsRes]) {
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  type ModuleRow = { code: string; name: string; year_num: string };
  type ModuleSubjectRow = { module_code: string; subject_id: string };
  type ChapterRow = { module_code: string; subject_id: string; published_count: number };
  type SubjectRow = { id: string; name: string };

  const modules = (modulesRes.data ?? []) as ModuleRow[];
  const moduleSubjects = (moduleSubjectsRes.data ?? []) as ModuleSubjectRow[];
  const chapters = (chaptersRes.data ?? []) as ChapterRow[];
  const subjectNameById = new Map(
    ((subjectsRes.data ?? []) as SubjectRow[]).map((s) => [s.id, s.name])
  );

  // Per-module derived data, computed once and reused for both the
  // module list and the year rollups.
  const subjectIdsByModule = new Map<string, Set<string>>();
  for (const ms of moduleSubjects) {
    if (!subjectIdsByModule.has(ms.module_code)) subjectIdsByModule.set(ms.module_code, new Set());
    subjectIdsByModule.get(ms.module_code)!.add(ms.subject_id);
  }
  const chapterCountByModule = new Map<string, number>();
  const publishedCountByModule = new Map<string, number>();
  for (const c of chapters) {
    chapterCountByModule.set(c.module_code, (chapterCountByModule.get(c.module_code) ?? 0) + 1);
    publishedCountByModule.set(
      c.module_code,
      (publishedCountByModule.get(c.module_code) ?? 0) + (Number(c.published_count) || 0)
    );
  }

  const modulesByYear = new Map<number, ModuleRow[]>();
  for (const m of modules) {
    const y = Number(m.year_num);
    if (!modulesByYear.has(y)) modulesByYear.set(y, []);
    modulesByYear.get(y)!.push(m);
  }

  const years = Array.from(modulesByYear.keys())
    .sort((a, b) => a - b)
    .map((year) => {
      const yearModules = modulesByYear.get(year)!;
      const subjectIdSet = new Set<string>();
      let chapterCount = 0;
      const moduleEntries = yearModules.map((m) => {
        const subjectIds = subjectIdsByModule.get(m.code) ?? new Set<string>();
        subjectIds.forEach((id) => subjectIdSet.add(id));
        const mChapterCount = chapterCountByModule.get(m.code) ?? 0;
        chapterCount += mChapterCount;
        return {
          code: m.code,
          name: m.name,
          chapterCount: mChapterCount,
          publishedCount: publishedCountByModule.get(m.code) ?? 0,
          subjectCount: subjectIds.size,
          subjectNames: Array.from(subjectIds)
            .map((id) => subjectNameById.get(id))
            .filter((n): n is string => Boolean(n))
            .sort(),
        };
      });

      return {
        year,
        label: YEAR_LABELS[year] ?? `Year ${year}`,
        moduleCount: yearModules.length,
        subjectCount: subjectIdSet.size,
        chapterCount,
        modules: moduleEntries,
      };
    });

  const totals = {
    modules: modules.length,
    subjects: subjectNameById.size,
    chapters: chapters.length,
  };

  return NextResponse.json(
    { years, totals },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  );
}
