// jest runs in a node environment, so localStorage is stubbed before the
// zustand stores (which read it when they are created) are imported.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  clear: () => mem.clear(),
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  removeItem: (k: string) => void mem.delete(k),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
};
(globalThis as unknown as { window: unknown }).window = { localStorage: (globalThis as { localStorage: Storage }).localStorage };

describe('clearLocalQuizState', () => {
  beforeEach(() => mem.clear());

  test('removes the saved quiz state and resets both stores', async () => {
    const { useChapterQuizStore } = await import('@/lib/chapter-quiz-store');
    const { useCustomExamStore } = await import('@/lib/custom-exam-store');
    const { clearLocalQuizState } = await import('@/lib/client-session');

    useChapterQuizStore.getState().answerQuestion(7, 'b');
    useChapterQuizStore.setState({ lastResult: { score: 9 } as never });
    useCustomExamStore.setState({ lastResult: { examId: 'x' } as never });
    mem.set('medz_chapter_progress_v1', '{"a":1}');

    // The previous student's data is really there before sign-out.
    expect(mem.get('medz-chapter-quiz-session')).toContain('"score":9');
    expect(mem.get('medz-custom-exam-session')).toContain('"examId":"x"');

    clearLocalQuizState();

    expect(mem.has('medz-chapter-quiz-session')).toBe(false);
    expect(mem.has('medz-custom-exam-session')).toBe(false);
    expect(mem.has('medz_chapter_progress_v1')).toBe(false);
    expect(useChapterQuizStore.getState().answers).toEqual({});
    expect(useChapterQuizStore.getState().lastResult).toBeNull();
    expect(useCustomExamStore.getState().lastResult).toBeNull();
  });

  test('keeps the theme preference', async () => {
    const { clearLocalQuizState } = await import('@/lib/client-session');
    mem.set('mz-theme', 'dark');
    clearLocalQuizState();
    expect(mem.get('mz-theme')).toBe('dark');
  });

  test('never throws when storage is broken', async () => {
    const { clearLocalQuizState } = await import('@/lib/client-session');
    const original = (globalThis as { localStorage: Storage }).localStorage.removeItem;
    (globalThis as { localStorage: Storage }).localStorage.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => clearLocalQuizState()).not.toThrow();
    (globalThis as { localStorage: Storage }).localStorage.removeItem = original;
  });
});
