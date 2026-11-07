import type { SupabaseClient } from '@supabase/supabase-js';
import { loadNextStepInput } from '@/lib/student/next-step';
import { academicSession } from '@/lib/academic-year';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  signInTestUser,
  createTestUser,
  deleteTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * What Home's "next step" is built from, gathered with the student's OWN
 * session (RLS applies). Year 5 has no seeded modules, so the fixture module
 * is the only one a year-5 student can be pointed at.
 */
describeIfSupabase('loadNextStepInput', () => {
  let admin: SupabaseClient;
  let student: TestUser;
  let db: SupabaseClient;

  const subjectIds: string[] = [];
  const moduleCodes: string[] = [];
  const chapterIds: string[] = [];

  let subjectSlug: string;
  let moduleCode: string;
  let ch1: string;
  let ch2: string;

  async function chapter(subjectId: string, ordinal: number, name: string): Promise<string> {
    const { data, error } = await admin
      .from('chapters')
      .insert({ module_code: moduleCode, subject_id: subjectId, slug: uniqueSlug('ch'), name, ordinal })
      .select('id')
      .single();
    if (error || !data) throw new Error(`chapter fixture failed: ${error?.message}`);
    const id = (data as { id: string }).id;
    chapterIds.push(id);
    const q = await admin.from('questions').insert({
      chapter_id: id,
      subject_id: subjectSlug,
      subject_bundle_id: ordinal,
      question: `${name} question`,
      choices: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }],
      correct_answer: 'a',
      topic: `${name} topic`,
      status: 'published',
    });
    if (q.error) throw new Error(`question fixture failed: ${q.error.message}`);
    return id;
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();
    subjectSlug = uniqueSlug('ns-subject');
    const { data: subject, error } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: 'Next step (test)' })
      .select('id')
      .single();
    if (error || !subject) throw new Error(`subject fixture failed: ${error?.message}`);
    const subjectId = (subject as { id: string }).id;
    subjectIds.push(subjectId);

    moduleCode = uniqueSlug('ns-module');
    const m = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: 'Next Step Module (test)', year_num: '5' });
    if (m.error) throw new Error(`module fixture failed: ${m.error.message}`);
    moduleCodes.push(moduleCode);

    ch1 = await chapter(subjectId, 1, 'First chapter (test)');
    ch2 = await chapter(subjectId, 2, 'Second chapter (test)');
  });

  beforeEach(async () => {
    student = await createTestUser(admin, 'student');
    db = await signInTestUser(student.email, student.password);
  });

  afterEach(async () => {
    await deleteTestUser(admin, student.id);
  });

  afterAll(async () => {
    for (const id of chapterIds) await admin.from('questions').delete().eq('chapter_id', id);
    for (const id of chapterIds) await admin.from('chapters').delete().eq('id', id);
    for (const code of moduleCodes) await admin.from('modules').delete().eq('code', code);
    for (const id of subjectIds) await admin.from('subjects').delete().eq('id', id);
  });

  async function setYear(year: number) {
    const r = await admin
      .from('profiles')
      .update({ academic_year: year, academic_year_session: academicSession() })
      .eq('id', student.id);
    if (r.error) throw new Error(r.error.message);
  }

  it('knows nothing about a brand-new student with no year', async () => {
    expect(await loadNextStepInput(db, student.id)).toEqual({
      unfinished: [],
      lastPlayed: null,
      academicYear: null,
      currentModule: null,
    });
  });

  it("points a new student at the first stocked module of their year", async () => {
    await setYear(5);
    const input = await loadNextStepInput(db, student.id);
    expect(input.academicYear).toBe(5);
    expect(input.currentModule).toEqual({
      code: moduleCode,
      name: 'Next Step Module (test)',
      href: `/student/catalogue/5/${encodeURIComponent(moduleCode)}`,
    });
  });

  it('keeps a year with no modules out of the input (the catalogue has none to show)', async () => {
    await setYear(4);
    const input = await loadNextStepInput(db, student.id);
    expect(input.academicYear).toBeNull();
    expect(input.currentModule).toBeNull();
  });

  it('lists unfinished attempts, ignoring a saved row with no answers', async () => {
    const qid = (await admin.from('questions').select('id').eq('chapter_id', ch1).single()).data as { id: number };
    await admin.from('chapter_quiz_progress').insert({
      student_id: student.id,
      chapter_id: ch1,
      subject_id: subjectSlug,
      answers: { [String(qid.id)]: 'a' },
      current_question_index: 0,
      total_questions: 1,
    });
    await admin.from('chapter_quiz_progress').insert({
      student_id: student.id,
      chapter_id: ch2,
      subject_id: subjectSlug,
      answers: {},
      current_question_index: 0,
      total_questions: 1,
    });
    const input = await loadNextStepInput(db, student.id);
    expect(input.unfinished).toEqual([
      { chapterId: ch1, chapterName: 'First chapter (test)', updatedAt: expect.any(String) },
    ]);
  });

  it('finds the last finished chapter and the chapter after it', async () => {
    await admin.from('quiz_sessions').insert({
      student_id: student.id,
      subject_id: subjectSlug,
      chapter_id: ch1,
      answers: {},
      score: 1,
      total_questions: 1,
      accuracy: 100,
      violations_count: 0,
      completed_at: new Date().toISOString(),
    });
    const { lastPlayed } = await loadNextStepInput(db, student.id);
    expect(lastPlayed).toEqual({
      chapterId: ch1,
      subjectHref: `/student/catalogue/5/${encodeURIComponent(moduleCode)}/${encodeURIComponent(subjectSlug)}`,
      nextChapterId: ch2,
      nextChapterName: 'Second chapter (test)',
    });
  });

  it('has no next chapter after the last one in the subject', async () => {
    await admin.from('quiz_sessions').insert({
      student_id: student.id,
      subject_id: subjectSlug,
      chapter_id: ch2,
      answers: {},
      score: 1,
      total_questions: 1,
      accuracy: 100,
      violations_count: 0,
      completed_at: new Date().toISOString(),
    });
    const { lastPlayed } = await loadNextStepInput(db, student.id);
    expect(lastPlayed?.chapterId).toBe(ch2);
    expect(lastPlayed?.nextChapterId).toBeUndefined();
  });
});
