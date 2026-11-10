import type { SupabaseClient } from '@supabase/supabase-js';
import { untypedFrom } from '@/lib/supabase-server';
import { currentAcademicYear } from '@/lib/academic-year';
import {
  EXAM_SCHEDULE,
  cairoToday,
  examDateFor,
  hasExamDates,
  type ExamSchedule,
} from '@/lib/exam-schedule';
import { planExam, type ExamGroup, type ExamPlan } from '@/lib/student/exam-plan';

export interface ExamModuleRow {
  code: string;
  name: string;
}
export interface ExamChapterRow {
  id: string;
  module_code: string;
  published_count: number;
}

/**
 * Pure: turns what the student has done into "questions left" per exam day.
 *
 * Decisions (ponytail: chapter-level, not per-question; refine with the
 * per-question reveals table if students report the number feeling off):
 *   - A chapter the student has finished at least once counts as fully covered.
 *   - A chapter with an unfinished attempt is credited with the answers saved so far.
 *   - Modules with no date set are left out; modules sharing a date form one group.
 */
export function buildExamGroups(
  year: number,
  modules: ExamModuleRow[],
  chapters: ExamChapterRow[],
  completedChapterIds: ReadonlySet<string>,
  answeredByChapter: ReadonlyMap<string, number>,
  schedule: ExamSchedule = EXAM_SCHEDULE
): ExamGroup[] {
  const remainingByModule = new Map<string, number>();
  for (const c of chapters) {
    const left = completedChapterIds.has(c.id)
      ? 0
      : Math.max(0, c.published_count - (answeredByChapter.get(c.id) ?? 0));
    remainingByModule.set(c.module_code, (remainingByModule.get(c.module_code) ?? 0) + left);
  }

  // "Is this date a module override?" = does it survive with the year dates removed.
  const overrideOnly: ExamSchedule = { byYear: {}, byModule: schedule.byModule };

  const byDate = new Map<string, ExamModuleRow[]>();
  for (const m of modules) {
    const date = examDateFor(year, m.code, schedule);
    if (!date) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), m]);
  }

  return [...byDate.entries()].map(([date, mods]) => {
    const single = mods.length === 1 ? mods[0] : null;
    const label =
      single && examDateFor(year, single.code, overrideOnly) ? `${single.name} exam` : `Year ${year} exams`;
    return {
      date,
      label,
      remainingQuestions: mods.reduce((sum, m) => sum + (remainingByModule.get(m.code) ?? 0), 0),
    };
  });
}

/**
 * The Home countdown for one student, or null when there is nothing to show:
 * no academic year chosen, no exam dates configured, or every exam has passed.
 * `db` is the student's own client; RLS limits it to their own rows.
 */
export async function getExamPlan(
  db: SupabaseClient,
  studentId: string,
  schedule: ExamSchedule = EXAM_SCHEDULE,
  now: Date = new Date()
): Promise<ExamPlan | null> {
  const client = untypedFrom(db);

  const profileRes = await client
    .from('profiles')
    .select('academic_year, academic_year_session')
    .eq('id', studentId)
    .single();
  const profile = profileRes.data as {
    academic_year: number | null;
    academic_year_session: number | null;
  } | null;
  const year = currentAcademicYear(profile?.academic_year, profile?.academic_year_session, now);
  // Placeholders: with no dates configured this is the whole request, one query.
  if (year === null || !hasExamDates(year, schedule)) return null;

  const modulesRes = await client
    .from('modules')
    .select('code, name')
    .eq('year_num', String(year))
    .eq('is_active', true)
    .order('code', { ascending: true });
  const modules = (modulesRes.data ?? []) as ExamModuleRow[];
  if (modules.length === 0) return null;

  const chaptersRes = await client
    .from('chapters')
    .select('id, module_code, published_count')
    .in('module_code', modules.map((m) => m.code))
    .gt('published_count', 0);
  const chapters = (chaptersRes.data ?? []) as ExamChapterRow[];
  const chapterIds = chapters.map((c) => c.id);

  const [sessionsRes, progressRes] =
    chapterIds.length > 0
      ? await Promise.all([
          client
            .from('quiz_sessions')
            .select('chapter_id')
            .eq('student_id', studentId)
            .in('chapter_id', chapterIds),
          client
            .from('chapter_quiz_progress')
            .select('chapter_id, answers')
            .eq('student_id', studentId)
            .in('chapter_id', chapterIds),
        ])
      : [{ data: [] }, { data: [] }];

  const completed = new Set(
    ((sessionsRes.data ?? []) as { chapter_id: string }[]).map((s) => s.chapter_id)
  );
  const answered = new Map<string, number>();
  for (const p of (progressRes.data ?? []) as {
    chapter_id: string;
    answers: Record<string, string> | null;
  }[]) {
    answered.set(p.chapter_id, Object.keys(p.answers ?? {}).length);
  }

  return planExam(
    cairoToday(now),
    buildExamGroups(year, modules, chapters, completed, answered, schedule)
  );
}
