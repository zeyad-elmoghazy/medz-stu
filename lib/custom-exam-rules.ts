/**
 * Selection rules for the Custom Exam builder
 * (app/(student)/student/exam/page.tsx) — pure and client-safe so the
 * page and POST /api/student/custom-exam apply the exact same maths.
 *
 * The server never trusts these: it recounts published questions from
 * the DB and rejects an over-sized request. They exist so the UI can
 * never *offer* an impossible exam in the first place.
 */

export type ExamChapterOption = {
  id: string;
  name: string;
  ordinal: number;
  /** Published questions in this chapter (chapters.published_count). */
  publishedCount: number;
};

export type ExamSubjectOption = {
  id: string;
  slug: string;
  name: string;
  /** Published questions across this subject's chapters in the module. */
  publishedCount: number;
  chapters: ExamChapterOption[];
};

/** Presets offered as quick picks; the pool maximum is always offered too. */
const COUNT_PRESETS = [10, 20, 30, 50] as const;

/**
 * Questions available for the current selection: published questions in
 * the selected chapters that sit inside a selected subject. A chapter
 * whose subject is not selected contributes nothing (stale selection),
 * and a chapter listed twice counts once.
 */
export function availableQuestionCount(
  subjects: ExamSubjectOption[],
  selectedSubjectIds: string[],
  selectedChapterIds: string[]
): number {
  const subjectSet = new Set(selectedSubjectIds);
  const chapterSet = new Set(selectedChapterIds);
  let total = 0;
  for (const subject of subjects) {
    if (!subjectSet.has(subject.id)) continue;
    for (const chapter of subject.chapters) {
      if (chapterSet.has(chapter.id)) total += Math.max(0, chapter.publishedCount);
    }
  }
  return total;
}

/**
 * Forces a requested question count into [1, max] (or 0 when nothing is
 * available). Applied on typing, paste, stepper and chips alike, so the
 * student can never hold a number larger than the pool.
 */
export function clampQuestionCount(requested: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  const cap = Math.floor(max);
  if (Number.isNaN(requested)) return 1;
  if (requested === Number.POSITIVE_INFINITY) return cap;
  const whole = Math.trunc(requested);
  return Math.min(cap, Math.max(1, whole));
}

/** Quick-pick chips that fit the pool, ending with the pool size itself ("all"). */
export function quickCountOptions(max: number): number[] {
  const cap = Math.floor(max);
  if (!Number.isFinite(cap) || cap <= 0) return [];
  const fitting: number[] = COUNT_PRESETS.filter((n) => n < cap);
  fitting.push(cap);
  return fitting;
}

/** Drops selected chapters that no longer belong to a selected subject (or don't exist). */
export function pruneChapterSelection(
  subjects: ExamSubjectOption[],
  selectedSubjectIds: string[],
  selectedChapterIds: string[]
): string[] {
  const subjectSet = new Set(selectedSubjectIds);
  const valid = new Set<string>();
  for (const subject of subjects) {
    if (!subjectSet.has(subject.id)) continue;
    for (const chapter of subject.chapters) valid.add(chapter.id);
  }
  return selectedChapterIds.filter((id) => valid.has(id));
}

/** "Select all" for chapters: every chapter that has questions, inside the given subjects. */
export function allChapterIds(
  subjects: ExamSubjectOption[],
  selectedSubjectIds: string[]
): string[] {
  const subjectSet = new Set(selectedSubjectIds);
  const ids: string[] = [];
  for (const subject of subjects) {
    if (!subjectSet.has(subject.id)) continue;
    for (const chapter of subject.chapters) {
      if (chapter.publishedCount > 0) ids.push(chapter.id);
    }
  }
  return ids;
}
