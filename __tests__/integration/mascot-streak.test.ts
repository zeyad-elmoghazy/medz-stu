// jest.mock() must be written before the imports it affects (ts-jest doesn't hoist),
// same note as chapter-quiz-xp.test.ts.
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return {
    ...actual,
    createRouteHandlerClient: jest.fn(),
  };
});

import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { POST as chapterSubmitPost } from '@/app/api/student/chapters/[chapterId]/submit/route';
import { GET as statusGet } from '@/app/api/student/mascot/status/route';
import {
  supabaseTestEnvAvailable,
  getAnonClient,
  getServiceRoleClient,
  signInTestUser,
  createTestUser,
  deleteTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';
import { addDays, todayISODate } from '@/lib/streak-date';

const mockCreateRouteHandlerClient = createRouteHandlerClient as jest.MockedFunction<
  typeof createRouteHandlerClient
>;

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

const TODAY = todayISODate();
const d = (n: number) => addDays(TODAY, -n);

/**
 * The mascot's server side, against a real local database: the read-only status
 * route, the streak outcome that both quiz submit routes now return, and the
 * 100-question rescue (it must be granted at exactly 100 questions, never at 99,
 * never after two missed days, and never twice).
 */
describeIfSupabase('mascot streak API', () => {
  const admin = getServiceRoleClient();
  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let questionIds: number[] = [];
  const students: TestUser[] = [];

  beforeAll(async () => {
    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: sErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id')
      .single();
    if (sErr || !subject) throw new Error(`subject fixture failed: ${sErr?.message}`);
    subjectId = (subject as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const { error: mErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: moduleCode });
    if (mErr) throw new Error(`module fixture failed: ${mErr.message}`);

    const { data: chapter, error: cErr } = await admin
      .from('chapters')
      .insert({ module_code: moduleCode, subject_id: subjectId, slug: uniqueSlug('chapter'), name: 'Mascot chapter' })
      .select('id')
      .single();
    if (cErr || !chapter) throw new Error(`chapter fixture failed: ${cErr?.message}`);
    chapterId = (chapter as { id: string }).id;

    const rows = Array.from({ length: 10 }, (_, i) => ({
      chapter_id: chapterId,
      subject_id: subjectSlug,
      subject_bundle_id: i + 1,
      question: `Mascot question ${i + 1}`,
      choices: [
        { id: 'a', text: 'Correct' },
        { id: 'b', text: 'Wrong' },
      ],
      correct_answer: 'a',
      status: 'published',
    }));
    const { data: qs, error: qErr } = await admin.from('questions').insert(rows).select('id');
    if (qErr || !qs) throw new Error(`questions fixture failed: ${qErr?.message}`);
    questionIds = (qs as { id: number }[]).map((q) => q.id);
  });

  afterAll(async () => {
    await admin.from('questions').delete().in('id', questionIds);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('subjects').delete().eq('id', subjectId);
  });

  afterEach(async () => {
    while (students.length) await deleteTestUser(admin, students.pop()!.id); // cascades to streaks/sessions
  });

  /** A signed-in student with a given streak history and some questions already answered today. */
  async function student(daysAgo: number[], answeredToday = 0) {
    const user = await createTestUser(admin, 'student');
    students.push(user);
    if (daysAgo.length) {
      const { error } = await admin
        .from('daily_streaks')
        .insert(daysAgo.map((n) => ({ student_id: user.id, streak_date: d(n), challenges_completed: 1 })));
      if (error) throw new Error(`streak fixture failed: ${error.message}`);
    }
    if (answeredToday > 0) {
      const answers: Record<string, string> = {};
      for (let i = 0; i < answeredToday; i += 1) answers[String(9_000_000 + i)] = 'a';
      const { error } = await admin.from('quiz_sessions').insert({
        student_id: user.id,
        subject_id: subjectSlug,
        answers,
        score: answeredToday,
        total_questions: answeredToday,
        accuracy: 100,
        violations_count: 0,
      });
      if (error) throw new Error(`session fixture failed: ${error.message}`);
    }
    const client = await signInTestUser(user.email, user.password);
    mockCreateRouteHandlerClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
    );
    return { user, client };
  }

  async function submit(correct = 10) {
    const answers: Record<string, string> = {};
    questionIds.forEach((id, i) => (answers[String(id)] = i < correct ? 'a' : 'b'));
    const res = await chapterSubmitPost(
      new NextRequest(`http://localhost/api/student/chapters/${chapterId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(200);
    return res.json();
  }

  async function streakRow(userId: string, day: string) {
    const { data } = await admin
      .from('daily_streaks')
      .select('challenges_completed')
      .eq('student_id', userId)
      .eq('streak_date', day);
    return (data ?? []) as { challenges_completed: number }[];
  }

  describe('GET /api/student/mascot/status', () => {
    it('describes a brand-new student and returns their own id', async () => {
      const { user } = await student([]);
      const res = await statusGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe(user.id);
      expect(body.today).toBe(TODAY);
      expect(body.state).toMatchObject({ currentStreak: 0, doneToday: false, everActive: false, rescueEligible: false });
      expect(body.rescue).toEqual({ answeredToday: 0, target: 100 });
    });

    it('reports an alive streak and writes nothing (opening the app cannot change a streak)', async () => {
      const { user } = await student([1, 2, 3]);
      const body = await (await statusGet()).json();
      expect(body.state).toMatchObject({ currentStreak: 3, doneToday: false });
      expect(await streakRow(user.id, TODAY)).toEqual([]);
    });

    it('reports rescue progress when yesterday was missed after a streak', async () => {
      await student([2, 3, 4], 95);
      const body = await (await statusGet()).json();
      expect(body.state).toMatchObject({ rescueEligible: true, previousStreak: 3 });
      expect(body.rescue).toEqual({ answeredToday: 95, target: 100 });
    });

    it('is 401 without a session', async () => {
      mockCreateRouteHandlerClient.mockResolvedValue(
        getAnonClient() as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>
      );
      expect((await statusGet()).status).toBe(401);
    });
  });

  describe('streak outcome on submit', () => {
    it('the first quiz of the day extends the streak; the second does not', async () => {
      await student([1, 2]);
      const first = await submit();
      expect(first.streak).toMatchObject({ before: 2, after: 3, extended: true, rescued: false, milestoneDays: 3, today: TODAY });
      expect(first.streak.last7[6]).toBe(true);

      const second = await submit();
      expect(second.streak).toMatchObject({ before: 3, after: 3, extended: false, rescued: false, milestoneDays: null });
    });

    it('a 6-day streak reaches the 7-day milestone', async () => {
      await student([1, 2, 3, 4, 5, 6]);
      expect((await submit()).streak).toMatchObject({ after: 7, extended: true, milestoneDays: 7 });
    });

    it('the very first quiz starts a streak at 1', async () => {
      await student([]);
      expect((await submit()).streak).toMatchObject({ before: 0, after: 1, extended: true, milestoneDays: null });
    });

    it('returns the previous attempt’s accuracy for this chapter', async () => {
      await student([]);
      const first = await submit(10);
      expect(first.previousAccuracy).toBeNull();
      const second = await submit(4);
      expect(second.previousAccuracy).toBe(100);
      const third = await submit(10);
      expect(third.previousAccuracy).toBe(40);
    });
  });

  describe('the 100-question streak rescue', () => {
    it('is NOT granted at 99 questions today', async () => {
      const { user } = await student([2, 3, 4], 89);
      const out = (await submit()).streak; // 89 + 10 = 99
      expect(out.rescued).toBe(false);
      expect(await streakRow(user.id, d(1))).toEqual([]);
    });

    it('IS granted at exactly 100, backfilling yesterday so the old streak is truly restored', async () => {
      const { user, client } = await student([2, 3, 4], 90);
      const out = (await submit()).streak; // 90 + 10 = 100
      expect(out).toMatchObject({ rescued: true, extended: true, after: 5 });
      expect(await streakRow(user.id, d(1))).toHaveLength(1);

      // the database's own streak function agrees: d0 + d1 + d2 + d3 + d4
      const { data, error } = await client.rpc('get_student_streak', { p_student_id: user.id });
      expect(error).toBeNull();
      expect(data).toBe(5);
    });

    it('is granted once only: a later quiz neither rescues again nor rewrites the day', async () => {
      const { user } = await student([2, 3, 4], 90);
      expect((await submit()).streak.rescued).toBe(true);
      const again = (await submit()).streak;
      expect(again.rescued).toBe(false);
      expect(await streakRow(user.id, d(1))).toHaveLength(1);
    });

    it('counts across several quizzes (the rescue lands on a later one, not the first of the day)', async () => {
      const { user } = await student([2, 3], 0);
      for (let i = 0; i < 9; i += 1) {
        const out = (await submit()).streak;
        expect(out.rescued).toBe(false);
      }
      expect((await streakRow(user.id, d(1))).length).toBe(0); // 90 questions so far
      const tenth = (await submit()).streak; // the 100th question
      expect(tenth).toMatchObject({ rescued: true, extended: false });
      expect(await streakRow(user.id, d(1))).toHaveLength(1);
    });

    it('is never granted after two missed days', async () => {
      const { user } = await student([3, 4, 5], 200);
      const out = (await submit()).streak;
      expect(out).toMatchObject({ rescued: false, after: 1 });
      expect(await streakRow(user.id, d(1))).toEqual([]);
      expect(await streakRow(user.id, d(2))).toEqual([]);
    });

    it('is never granted for a lonely one-day streak', async () => {
      const { user } = await student([2], 200);
      expect((await submit()).streak.rescued).toBe(false);
      expect(await streakRow(user.id, d(1))).toEqual([]);
    });
  });
});
