import { SUBJECTS_CONFIG } from '@/lib/dashboard-data';

/**
 * Professor-side data types.
 *
 * `SubjectBreakdown` is the per-subject slice of one student's
 * performance (matches the shape of `student_subject_stats`).
 * `StudentRecord` is one row in the professor's roster — the
 * full snapshot the API returns per student.
 */

export type SubjectBreakdown = {
  subjectId: string;
  subjectName: string;
  avgAccuracy: number;
  sessionsCompleted: number;
  totalCorrect: number;
  totalAnswered: number;
};

export type StudentRecord = {
  id: string;
  fullName: string;
  email: string;
  joinedAt: string;
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  challengesCompleted: number;
  lastActive: string | null;
  streakDays: number;
  subjects: SubjectBreakdown[];
};

/**
 * Demo-mode roster — used when the page can't reach Supabase.
 *
 * Names are intentionally common in the target market (Egyptian
 * medical school cohorts) so screenshots and demos look real.
 * Numbers are seeded deterministically so the demo doesn't shift
 * between renders.
 */
export function getMockProfessorStudents(): StudentRecord[] {
  const seed = [
    { id: '1', name: 'Omar Abdelaziz', email: 'omar.abdelaziz@kasralainy.edu', accuracy: 84, sessions: 5, joined: '2026-05-12' },
    { id: '2', name: 'Salma Ahmed', email: 'salma.ahmed@medicine.aucegypt.edu', accuracy: 77, sessions: 4, joined: '2026-05-14' },
    { id: '3', name: 'Yusuf Khalil', email: 'yusuf.khalil@asu.edu.eg', accuracy: 72, sessions: 4, joined: '2026-05-16' },
    { id: '4', name: 'Nour El-Sayed', email: 'nour.elsayed@alexmed.edu.eg', accuracy: 91, sessions: 6, joined: '2026-05-18' },
    { id: '5', name: 'Farida Galal', email: 'farida.galal@kasralainy.edu', accuracy: 68, sessions: 3, joined: '2026-05-20' },
    { id: '6', name: 'Mahmoud Ibrahim', email: 'mahmoud.ibrahim@asu.edu.eg', accuracy: 58, sessions: 2, joined: '2026-05-22' },
    { id: '7', name: 'Aya Mostafa', email: 'aya.mostafa@cu.edu.eg', accuracy: 49, sessions: 2, joined: '2026-05-24' },
    { id: '8', name: 'Karim Hassan', email: 'karim.hassan@medicine.aucegypt.edu', accuracy: 0, sessions: 0, joined: '2026-06-02' },
  ];

  return seed.map((s, idx) => {
    const totalAnswered = s.sessions * 11;
    const totalCorrect = Math.round((s.accuracy / 100) * totalAnswered);
    const lastActiveOffset = idx === 0 ? 0 : idx === 1 ? 0 : idx * 86400000;
    const lastActive =
      s.sessions === 0
        ? null
        : new Date(Date.now() - lastActiveOffset).toISOString();

    const subjects: SubjectBreakdown[] = SUBJECTS_CONFIG.map((cfg) => {
      if (cfg.id !== 'histology' || s.sessions === 0) {
        return {
          subjectId: cfg.id,
          subjectName: cfg.name,
          avgAccuracy: 0,
          sessionsCompleted: 0,
          totalCorrect: 0,
          totalAnswered: 0,
        };
      }
      return {
        subjectId: cfg.id,
        subjectName: cfg.name,
        avgAccuracy: s.accuracy,
        sessionsCompleted: s.sessions,
        totalCorrect,
        totalAnswered,
      };
    });

    return {
      id: s.id,
      fullName: s.name,
      email: s.email,
      joinedAt: new Date(s.joined).toISOString(),
      totalAnswered,
      totalCorrect,
      overallAccuracy: s.accuracy,
      challengesCompleted: s.sessions,
      lastActive,
      streakDays:
        s.sessions === 0 ? 0 : Math.max(1, Math.round(s.sessions / 2)),
      subjects,
    };
  });
}
