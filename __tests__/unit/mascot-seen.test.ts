import { markSeen, readSeen, SEEN_KEY } from '@/lib/mascot/seen';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('seen greetings', () => {
  it('starts empty', () => {
    expect(readSeen('u1', fakeStorage())).toEqual({});
  });

  it('remembers a slot for the student and date it was marked', () => {
    const s = fakeStorage();
    markSeen('u1', ['daily'], '2026-11-05', s);
    expect(readSeen('u1', s)).toEqual({ daily: '2026-11-05', evening: null });
  });

  it('keeps the other slot when only one is marked', () => {
    const s = fakeStorage();
    markSeen('u1', ['daily'], '2026-11-05', s);
    markSeen('u1', ['evening'], '2026-11-06', s);
    expect(readSeen('u1', s)).toEqual({ daily: '2026-11-05', evening: '2026-11-06' });
  });

  it('marks several slots at once (the evening nudge counts as today’s hello too)', () => {
    const s = fakeStorage();
    markSeen('u1', ['daily', 'evening'], '2026-11-05', s);
    expect(readSeen('u1', s)).toEqual({ daily: '2026-11-05', evening: '2026-11-05' });
  });

  it('a different student on the same device starts clean and replaces the record', () => {
    const s = fakeStorage();
    markSeen('u1', ['daily'], '2026-11-05', s);
    expect(readSeen('u2', s)).toEqual({});
    markSeen('u2', ['daily'], '2026-11-05', s);
    expect(readSeen('u1', s)).toEqual({});
    expect(readSeen('u2', s).daily).toBe('2026-11-05');
  });

  it('ignores corrupt data without throwing', () => {
    expect(readSeen('u1', fakeStorage({ [SEEN_KEY]: 'not json' }))).toEqual({});
    expect(readSeen('u1', fakeStorage({ [SEEN_KEY]: 'null' }))).toEqual({});
    expect(readSeen('u1', fakeStorage({ [SEEN_KEY]: '{"user":"u1","daily":5}' }))).toEqual({ daily: null, evening: null });
  });

  it('is silent when storage is missing or throws', () => {
    expect(readSeen('u1', null)).toEqual({});
    expect(() => markSeen('u1', ['daily'], '2026-11-05', null)).not.toThrow();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeen('u1', throwing)).toEqual({});
    expect(() => markSeen('u1', ['daily'], '2026-11-05', throwing)).not.toThrow();
  });
});
