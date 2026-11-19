import { saveChapterProgress } from '@/lib/server/chapter-quiz-save';

// XP is credited by a different module with its own tests; here it is a no-op.
jest.mock('@/lib/server/xp', () => ({ awardAnswersXp: jest.fn().mockResolvedValue(0) }));

/**
 * A tiny fake of the service-role client: just enough of the query builder for
 * saveChapterProgress, recording what gets upserted into chapter_quiz_progress.
 */
function fakeDb(opts: {
  bankIds: number[];
  stored: { answers: Record<string, string>; current_question_index: number } | null;
}) {
  const upserts: Record<string, unknown>[] = [];
  const result = (data: unknown) => ({ data, error: null });
  const chain = (data: unknown) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      maybeSingle: () => Promise.resolve(result(data)),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result(data)).then(resolve),
    };
    return c;
  };
  const db = {
    from: (table: string) => {
      if (table === 'questions') {
        return chain(opts.bankIds.map((id) => ({ id, subject_id: 'histology' })));
      }
      return {
        ...chain(opts.stored),
        upsert: (row: Record<string, unknown>) => {
          upserts.push(row);
          return Promise.resolve(result(null));
        },
        delete: () => chain(null),
      };
    },
  };
  return { db, upserts };
}

const save = (
  stored: { answers: Record<string, string>; current_question_index: number } | null,
  input: Parameters<typeof saveChapterProgress>[3],
  bankIds = [10, 11, 12, 13, 14]
) => {
  const { db, upserts } = fakeDb({ bankIds, stored });
  return saveChapterProgress(db, 'student-1', 'chapter-1', input).then((res) => ({
    res,
    row: upserts[0] as { current_question_index: number; answers: Record<string, string> },
  }));
};

describe('saveChapterProgress: resume index', () => {
  const stored = { answers: { '10': 'a', '11': 'b', '12': 'c' }, current_question_index: 3 };

  it('re-sending an already-answered question does not move the saved index', async () => {
    // What the page does on load to re-fetch a missing reveal: same answer,
    // whatever question happens to be on screen.
    const { row } = await save(stored, {
      answers: { '10': 'a' },
      currentQuestionIndex: 0,
      keepExisting: true,
    });
    expect(row.current_question_index).toBe(3);
    expect(row.answers).toEqual(stored.answers);
  });

  it('answering a new question moves the index to the one sent', async () => {
    const { row, res } = await save(stored, {
      answers: { '13': 'd' },
      currentQuestionIndex: 3,
      keepExisting: true,
    });
    expect(row.current_question_index).toBe(3);
    expect(row.answers['13']).toBe('d');
    expect(res.ok && res.answered).toBe(4);

    const next = await save(
      { answers: { '10': 'a' }, current_question_index: 0 },
      { answers: { '11': 'b' }, currentQuestionIndex: 1, keepExisting: true }
    );
    expect(next.row.current_question_index).toBe(1);
  });

  it('a progress snapshot (Save & Exit) still sets the index it sends', async () => {
    const { row } = await save(stored, {
      answers: { '10': 'a', '11': 'b', '12': 'c' },
      currentQuestionIndex: 2,
    });
    expect(row.current_question_index).toBe(2);
  });

  it('the first answer of an attempt uses the index sent', async () => {
    const { row } = await save(null, {
      answers: { '10': 'a' },
      currentQuestionIndex: 0,
      keepExisting: true,
    });
    expect(row.current_question_index).toBe(0);
  });

  it('never stores an index past the last question', async () => {
    const { row } = await save(
      { answers: { '10': 'a' }, current_question_index: 99 },
      { answers: { '10': 'a' }, currentQuestionIndex: 0, keepExisting: true }
    );
    expect(row.current_question_index).toBe(4);
  });
});
