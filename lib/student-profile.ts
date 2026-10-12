import { currentAcademicYear } from '@/lib/academic-year';

/**
 * The `profiles` columns the self-service profile endpoints read. One
 * place so GET and PATCH always return the same shape.
 */
export const PROFILE_COLUMNS =
  'id, role, full_name, username, email, created_at, academic_year, academic_year_session, notify_email, notify_reminders, total_xp';

export type ProfileRow = {
  id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  created_at: string;
  academic_year: number | null;
  academic_year_session: number | null;
  notify_email: boolean;
  notify_reminders: boolean;
  total_xp: number;
};

export type StudentBadge = { type: string; earnedAt: string };

/** What GET/PATCH /api/student/profile return and the profile page consumes. */
export type StudentProfileDto = {
  id: string;
  fullName: string;
  username: string | null;
  email: string;
  joinedAt: string;
  /** Current year (1–5), derived from the September rollover; null if never chosen. */
  academicYear: number | null;
  /** What the student picked and the session they picked it in (null if never). */
  chosenAcademicYear: number | null;
  chosenAcademicSession: number | null;
  notifyEmail: boolean;
  notifyReminders: boolean;
  totalXp: number;
  badges: StudentBadge[];
};

export function toProfileDto(
  row: ProfileRow,
  badges: StudentBadge[] = [],
  now: Date = new Date()
): StudentProfileDto {
  return {
    id: row.id,
    fullName: row.full_name ?? '',
    username: row.username,
    email: row.email ?? '',
    joinedAt: row.created_at,
    academicYear: currentAcademicYear(row.academic_year, row.academic_year_session, now),
    chosenAcademicYear: row.academic_year,
    chosenAcademicSession: row.academic_year_session,
    notifyEmail: row.notify_email,
    notifyReminders: row.notify_reminders,
    totalXp: Number(row.total_xp ?? 0),
    badges,
  };
}
