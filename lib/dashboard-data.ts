/**
 * Student dashboard data layer.
 *
 * Types + a single subject catalog constant. Live per-student
 * numbers come from `/api/student/stats`, which reads Supabase.
 */

export type Subject = {
  id: string;
  name: string;
  icon: string;          // emoji
  color: string;         // hex, e.g. "#7C3AED"
  colorBg: string;       // e.g. "bg-purple-500/10"
  available: boolean;
  progress: number;      // 0-100
  accuracy: number;      // 0-100, 0 if no attempts
  questionsAnswered: number;
  correctAnswers: number;
  challengesCompleted: number;
  // LIVE published-question count from the DB (chapters
  // trigger keeps chapters.published_count in sync, and
  // /api/student/stats sums by subject_id). This is the
  // number that changes the moment a professor publishes.
  publishedCount?: number;
};

export type ChallengeResult = {
  id: string;
  subjectId: string;
  subjectName: string;
  // Where the challenge happened. All null for legacy proctored-quiz
  // sessions (quiz_sessions.chapter_id IS NULL), which have no chapter.
  chapterId: string | null;
  chapterName: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  score: number;         // e.g. 8
  total: number;         // e.g. 11
  accuracy: number;      // e.g. 72.7
  completedAt: string;   // ISO date string
};

export type ProgressDataPoint = {
  date: string;          // e.g. "May 14"
  accuracy: number;      // 0-100
};

// A weak spot, at chapter granularity. (It used to be per
// `questions.topic`, but topics are near-unique per question in the
// real bank, so no topic ever reached the minimum sample.)
export type FocusArea = {
  chapterId: string;
  chapterName: string;
  subjectName: string;
  moduleCode: string;
  moduleName: string | null;
  accuracy: number;      // 0-100
  attempted: number;     // question-attempts this chapter is based on
};

/**
 * "Module 205 · Nervous & Cardiovascular Systems" — or just "Module 102"
 * when the module has no real name yet (the DB holds placeholders like
 * "Module 102", which would otherwise render as "Module 102 · Module 102").
 */
export function moduleLabel(code: string, name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  const isPlaceholder =
    trimmed === '' || trimmed === code || /^module\s+\d+$/i.test(trimmed);
  return isPlaceholder ? `Module ${code}` : `Module ${code} · ${trimmed}`;
}

export type ChapterMistake = {
  chapterId: string;
  chapterName: string;
  subjectName: string;       // '' if the chapter's subject could not be resolved
  moduleCode: string;
  moduleName: string | null;
  questionIds: number[];
};

export type StudentStats = {
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracy: number;
  streakDays: number;
  lastActiveDate: string;
  subjects: Subject[];
  recentChallenges: ChallengeResult[];
  progressHistory: ProgressDataPoint[];
  // Real, DB-backed numbers from chapter-quiz activity — see
  // app/api/student/stats/route.ts and lib/server/chapter-mistakes.ts.
  bookmarksCount: number;
  focusAreas: FocusArea[];
  mistakes: ChapterMistake[];
};

// Static catalog of subjects (icon, palette, availability). The
// numeric fields — progress, accuracy, questionsAnswered,
// correctAnswers, challengesCompleted — are the *empty defaults*
// and get overwritten with the caller's real numbers by
// /api/student/stats. Do NOT put mock values here; a real
// student who has never attempted a subject should see zeros,
// not someone else's leftover demo score.
export const SUBJECTS_CONFIG: Subject[] = [
  {
    id: 'histology',
    name: 'Histology',
    icon: '🔬',
    color: '#7C3AED',
    colorBg: 'bg-purple-500/10',
    available: true,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
  {
    id: 'anatomy',
    name: 'Anatomy',
    icon: '🦴',
    color: '#0EA5E9',
    colorBg: 'bg-sky-500/10',
    available: false,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
  {
    id: 'physiology',
    name: 'Physiology',
    icon: '❤️',
    color: '#EF4444',
    colorBg: 'bg-red-500/10',
    available: false,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
  {
    id: 'biochemistry',
    name: 'Biochemistry',
    icon: '⚗️',
    color: '#10B981',
    colorBg: 'bg-emerald-500/10',
    available: false,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
  {
    id: 'pharmacology',
    name: 'Pharmacology',
    icon: '💊',
    color: '#F97316',
    colorBg: 'bg-orange-500/10',
    available: false,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
  {
    id: 'pathology',
    name: 'Pathology',
    icon: '🧫',
    color: '#EC4899',
    colorBg: 'bg-pink-500/10',
    available: false,
    progress: 0,
    accuracy: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    challengesCompleted: 0,
  },
];

/**
 * Empty stats — rendered when a real student has no quiz sessions
 * yet, or when the API fails and we still need a valid shape so
 * the dashboard can paint without `?.` everywhere.
 */
export function getEmptyStudentStats(): StudentStats {
  return {
    totalQuestionsAnswered: 0,
    totalCorrectAnswers: 0,
    overallAccuracy: 0,
    streakDays: 0,
    lastActiveDate: new Date().toISOString(),
    subjects: SUBJECTS_CONFIG,
    recentChallenges: [],
    progressHistory: [],
    bookmarksCount: 0,
    focusAreas: [],
    mistakes: [],
  };
}
