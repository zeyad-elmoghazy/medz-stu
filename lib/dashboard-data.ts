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
  score: number;         // e.g. 8
  total: number;         // e.g. 11
  accuracy: number;      // e.g. 72.7
  completedAt: string;   // ISO date string
};

export type ProgressDataPoint = {
  date: string;          // e.g. "May 14"
  accuracy: number;      // 0-100
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
  };
}
