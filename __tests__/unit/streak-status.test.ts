import {
  applyStreakRescueIfEarned,
  buildStreakOutcome,
  countQuestionsAnsweredOn,
  fetchActiveDates,
  getMascotStatus,
  previousChapterAccuracy,
  snapshotBeforeSubmit,
  type StreakDb,
} from '@/lib/server/streak-status';
import { addDays } from '@/lib/streak-date';
import { RESCUE_QUESTION_TARGET } from '@/lib/streak-state';

const TODAY = '2026-11-05';
const USER = 'user-1';
const d = (n: number) => addDays(TODAY, -n);

type Row = Record<string, unknown>;

/**
 * A tiny in-memory stand-in for the PostgREST builder, supporting exactly the calls
 * streak-status.ts makes. It records every write so tests can assert on them.
 */
function fakeDb(tables: Record<string, Row[]>, failOn?: string) {
  const writes: { table: string; row: Row; opts: unknown }[] = [];
  const db: StreakDb = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let limit = Infinity;
      let order: { col: string; asc: boolean } | null = null;
      const builder: any = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        gt: (c: string, v: number) => (filters.push((r) => (r[c] as number) > v), builder),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), builder),
        lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), builder),
        order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), builder),
        limit: (n: number) => ((limit = n), builder),
        upsert: async (row: Row, opts: unknown) => {
          if (failOn === table) return { error: { message: 'boom' } };
          writes.push({ table, row, opts });
          const rows = tables[table] ?? (tables[table] = []);
          const exists = rows.some((r) => r.student_id === row.student_id && r.streak_date === row.streak_date);
          if (!exists) rows.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (failOn === table) return resolve({ data: null, error: { message: 'boom' } });
          let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          if (order) rows = [...rows].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? 1 : -1) * (order!.asc ? -1 : 1));
          resolve({ data: rows.slice(0, limit), error: null });
        },
      };
      return builder;
    },
  };
  return { db, writes, tables };
}

const streakRow = (day: string, n = 1): Row => ({ student_id: USER, streak_date: day, challenges_completed: n });

/** A completed quiz session on `day` (local noon, so it is inside that day whatever the timezone). */
function session(day: string, answered: number, total = answered): Row {
  const [y, m, dd] = day.split('-').map(Number);
  const answers: Record<string, string> = {};
  for (let i = 0; i < answered; i += 1) answers[String(i)] = 'A';
  return {
    student_id: USER,
    answers,
    total_questions: total,
    accuracy: 80,
    chapter_id: 'ch-1',
    completed_at: new Date(y, m - 1, dd, 12).toISOString(),
  };
}

describe('fetchActiveDates', () => {
  it('returns only days with at least one completed quiz, for this student only', async () => {
    const { db } = fakeDb({
      daily_streaks: [
        streakRow(d(1)),
        streakRow(d(2), 3),
        streakRow(d(3), 0), // login ping row: not a streak day
        { student_id: 'someone-else', streak_date: d(1), challenges_completed: 5 },
      ],
    });
    expect((await fetchActiveDates(db, USER, TODAY)).sort()).toEqual([d(2), d(1)].sort());
  });

  it('throws on a database error so callers can decide what to do', async () => {
    const { db } = fakeDb({ daily_streaks: [] }, 'daily_streaks');
    await expect(fetchActiveDates(db, USER, TODAY)).rejects.toThrow('daily_streaks read failed');
  });
});

describe('countQuestionsAnsweredOn', () => {
  it('sums answered questions across today’s completed sessions only', async () => {
    const { db } = fakeDb({
      quiz_sessions: [session(TODAY, 40), session(TODAY, 25, 30), session(d(1), 90), { ...session(TODAY, 5), student_id: 'x' }],
    });
    expect(await countQuestionsAnsweredOn(db, USER, TODAY)).toBe(65);
  });

  it('never counts more than the session’s total, and falls back to the total without answers', async () => {
    const odd = { ...session(TODAY, 0, 20), answers: null };
    const over = session(TODAY, 50, 10);
    const { db } = fakeDb({ quiz_sessions: [odd, over] });
    expect(await countQuestionsAnsweredOn(db, USER, TODAY)).toBe(30);
  });
});

describe('getMascotStatus', () => {
  it('skips the answered-today query unless a rescue is on the table', async () => {
    const { db } = fakeDb({ daily_streaks: [streakRow(d(1))], quiz_sessions: [session(TODAY, 40)] });
    const s = await getMascotStatus(db, USER, TODAY);
    expect(s.state.currentStreak).toBe(1);
    expect(s.state.rescueEligible).toBe(false);
    expect(s.rescue).toEqual({ answeredToday: 0, target: RESCUE_QUESTION_TARGET });
  });

  it('reports rescue progress when yesterday was missed after a streak', async () => {
    const { db } = fakeDb({ daily_streaks: [streakRow(d(2)), streakRow(d(3))], quiz_sessions: [session(TODAY, 37)] });
    const s = await getMascotStatus(db, USER, TODAY);
    expect(s.state.rescueEligible).toBe(true);
    expect(s.rescue.answeredToday).toBe(37);
  });
});

describe('applyStreakRescueIfEarned', () => {
  const missedYesterday = () => [streakRow(d(2)), streakRow(d(3)), streakRow(d(4))];

  it('does NOT rescue at 99 questions', async () => {
    const f = fakeDb({ daily_streaks: missedYesterday(), quiz_sessions: [session(TODAY, 99)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(false);
    expect(f.writes).toHaveLength(0);
  });

  it('rescues at exactly 100 questions by backfilling yesterday', async () => {
    const f = fakeDb({ daily_streaks: missedYesterday(), quiz_sessions: [session(TODAY, 100)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(true);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({
      table: 'daily_streaks',
      row: { student_id: USER, streak_date: d(1), challenges_completed: 1 },
      opts: { onConflict: 'student_id,streak_date', ignoreDuplicates: true },
    });
  });

  it('counts questions across several quizzes (60 + 40)', async () => {
    const f = fakeDb({ daily_streaks: missedYesterday(), quiz_sessions: [session(TODAY, 60), session(TODAY, 40)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(true);
  });

  it('is idempotent: once yesterday exists, a second call writes nothing', async () => {
    const f = fakeDb({ daily_streaks: missedYesterday(), quiz_sessions: [session(TODAY, 120)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(true);
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(false);
    expect(f.writes).toHaveLength(1);
  });

  it('is never granted after two missed days', async () => {
    const f = fakeDb({ daily_streaks: [streakRow(d(3)), streakRow(d(4)), streakRow(d(5))], quiz_sessions: [session(TODAY, 500)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(false);
    expect(f.writes).toHaveLength(0);
  });

  it('is never granted when nothing was missed', async () => {
    const f = fakeDb({ daily_streaks: [streakRow(d(1)), streakRow(d(2))], quiz_sessions: [session(TODAY, 500)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(false);
  });

  it('is never granted for a lonely one-day streak', async () => {
    const f = fakeDb({ daily_streaks: [streakRow(d(2))], quiz_sessions: [session(TODAY, 500)] });
    expect(await applyStreakRescueIfEarned(f.db, USER, TODAY)).toBe(false);
  });

  it('surfaces a write failure instead of claiming success', async () => {
    const base = fakeDb({ daily_streaks: missedYesterday(), quiz_sessions: [session(TODAY, 100)] });
    const failing: StreakDb = {
      from: (t: string) => {
        const b = base.db.from(t);
        if (t === 'daily_streaks') {
          const realSelect = b.select.bind(b);
          b.select = (...a: unknown[]) => realSelect(...a);
          b.upsert = async () => ({ error: { message: 'write blocked' } });
        }
        return b;
      },
    };
    await expect(applyStreakRescueIfEarned(failing, USER, TODAY)).rejects.toThrow('streak rescue write failed');
  });
});

describe('snapshotBeforeSubmit / buildStreakOutcome', () => {
  it('reports an extended streak after the first quiz of the day is recorded', async () => {
    const f = fakeDb({ daily_streaks: [streakRow(d(1)), streakRow(d(2))] });
    const before = await snapshotBeforeSubmit(f.db, USER, TODAY);
    f.tables.daily_streaks.push(streakRow(TODAY)); // what record_quiz_result does
    const o = await buildStreakOutcome(f.db, USER, TODAY, before);
    expect(o).toMatchObject({ before: 2, after: 3, extended: true, rescued: false, milestoneDays: 3 });
  });

  it('applies the rescue and reports it when the 100th question is answered', async () => {
    const f = fakeDb({
      daily_streaks: [streakRow(d(2)), streakRow(d(3))],
      quiz_sessions: [session(TODAY, 100)],
    });
    const before = await snapshotBeforeSubmit(f.db, USER, TODAY);
    f.tables.daily_streaks.push(streakRow(TODAY));
    const o = await buildStreakOutcome(f.db, USER, TODAY, before);
    expect(o).toMatchObject({ rescued: true, extended: true, after: 4 });
  });

  it('returns null, not an exception, when anything fails: a quiz submit must never break', async () => {
    const ok = fakeDb({ daily_streaks: [streakRow(d(1))] });
    const before = await snapshotBeforeSubmit(ok.db, USER, TODAY);
    const broken = fakeDb({ daily_streaks: [] }, 'daily_streaks');
    expect(await buildStreakOutcome(broken.db, USER, TODAY, before)).toBeNull();
    expect(await snapshotBeforeSubmit(broken.db, USER, TODAY)).toBeNull();
    expect(await buildStreakOutcome(ok.db, USER, TODAY, null)).toBeNull();
  });
});

describe('previousChapterAccuracy', () => {
  it('returns the most recent earlier attempt in that chapter', async () => {
    const older = { ...session(d(5), 10), accuracy: 55, chapter_id: 'ch-1' };
    const newer = { ...session(d(2), 10), accuracy: 72.5, chapter_id: 'ch-1' };
    const other = { ...session(d(1), 10), accuracy: 99, chapter_id: 'ch-2' };
    const { db } = fakeDb({ quiz_sessions: [older, newer, other] });
    expect(await previousChapterAccuracy(db, USER, 'ch-1')).toBe(72.5);
  });

  it('is null for a first attempt or on any error', async () => {
    expect(await previousChapterAccuracy(fakeDb({ quiz_sessions: [] }).db, USER, 'ch-1')).toBeNull();
    expect(await previousChapterAccuracy(fakeDb({ quiz_sessions: [] }, 'quiz_sessions').db, USER, 'ch-1')).toBeNull();
  });
});
