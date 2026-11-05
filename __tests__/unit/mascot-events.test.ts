import { consumeMascotEvent, EVENT_KEY, EVENT_TTL_MS, pushMascotEvent } from '@/lib/mascot/events';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe('mascot event hand-off', () => {
  it('delivers an event once, then clears it', () => {
    const s = fakeStorage();
    pushMascotEvent('saved-exit', s, 1000);
    expect(consumeMascotEvent(s, 1500)).toEqual({ type: 'saved-exit', at: 1000 });
    expect(consumeMascotEvent(s, 1600)).toBeNull();
    expect(EVENT_KEY in s.data).toBe(false);
  });

  it('carries the sign-out goodbye too', () => {
    const s = fakeStorage();
    pushMascotEvent('signed-out', s, 5);
    expect(consumeMascotEvent(s, 10)?.type).toBe('signed-out');
  });

  it('the newest event wins (single slot)', () => {
    const s = fakeStorage();
    pushMascotEvent('saved-exit', s, 1000);
    pushMascotEvent('signed-out', s, 2000);
    expect(consumeMascotEvent(s, 2500)?.type).toBe('signed-out');
  });

  it('drops a stale event but still clears it', () => {
    const s = fakeStorage();
    pushMascotEvent('saved-exit', s, 0);
    expect(consumeMascotEvent(s, EVENT_TTL_MS + 1)).toBeNull();
    expect(EVENT_KEY in s.data).toBe(false);
  });

  it('keeps an event that is exactly at the time limit', () => {
    const s = fakeStorage();
    pushMascotEvent('saved-exit', s, 0);
    expect(consumeMascotEvent(s, EVENT_TTL_MS)).not.toBeNull();
  });

  it('rejects malformed, unknown or future-dated payloads without throwing', () => {
    expect(consumeMascotEvent(fakeStorage({ [EVENT_KEY]: 'not json' }), 0)).toBeNull();
    expect(consumeMascotEvent(fakeStorage({ [EVENT_KEY]: '{"type":"nope","at":1}' }), 2)).toBeNull();
    expect(consumeMascotEvent(fakeStorage({ [EVENT_KEY]: '{"type":"saved-exit"}' }), 2)).toBeNull();
    expect(consumeMascotEvent(fakeStorage({ [EVENT_KEY]: '{"type":"saved-exit","at":999999}' }), 10)).toBeNull();
  });

  it('is silent when storage is unavailable or throws', () => {
    expect(() => pushMascotEvent('saved-exit', null)).not.toThrow();
    expect(consumeMascotEvent(null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => pushMascotEvent('saved-exit', throwing)).not.toThrow();
    expect(consumeMascotEvent(throwing)).toBeNull();
  });
});
