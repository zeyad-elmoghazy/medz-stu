import { decideGreeting, EVENING_HOUR, type GreetingInput } from '@/lib/mascot/greeting';
import { computeStreakState } from '@/lib/streak-state';
import { addDays } from '@/lib/streak-date';
import {
  improvementLine,
  pick,
  RESULT_COPY,
  SAVED_EXIT_LINES,
  seedFromString,
  SIGNED_OUT_LINES,
  streakCelebrationCopy,
  POKE_LINES,
} from '@/lib/mascot/copy';

const TODAY = '2026-11-05';
const d = (n: number) => addDays(TODAY, -n);

function input(over: Partial<GreetingInput> & { active: string[] }): GreetingInput {
  return {
    state: computeStreakState(over.active, TODAY),
    rescue: over.rescue ?? { answeredToday: 0, target: 100 },
    localHour: over.localHour ?? 10,
    seen: over.seen ?? {},
  };
}

describe('decideGreeting', () => {
  it('brand-new student gets a welcome with the wave pose', () => {
    const g = decideGreeting(input({ active: [] }))!;
    expect(g.kind).toBe('welcome');
    expect(g.pose).toBe('rest');
    expect(g.cta?.href).toBe('/student/catalogue');
    expect(g.marks).toEqual(['daily']);
  });

  it('alive streak, not yet done: encourages extending it', () => {
    const g = decideGreeting(input({ active: [d(1), d(2), d(3)] }))!;
    expect(g.kind).toBe('streak-alive');
    expect(g.headline).toContain('3-day streak');
    expect(g.headline).toContain('Make it 4');
    expect(g.progress).toBeNull();
  });

  it('missed exactly yesterday after a streak: rescue greeting with the 100-question meter', () => {
    const g = decideGreeting(input({ active: [d(2), d(3), d(4)], rescue: { answeredToday: 37, target: 100 } }))!;
    expect(g.kind).toBe('rescue');
    expect(g.pose).toBe('worried');
    expect(g.headline).toContain('3-day streak');
    expect(g.body).toContain('100 questions');
    expect(g.progress).toEqual({ done: 37, total: 100 });
  });

  it('rescue progress never exceeds the target', () => {
    const g = decideGreeting(input({ active: [d(2), d(3)], rescue: { answeredToday: 140, target: 100 } }))!;
    expect(g.progress).toEqual({ done: 100, total: 100 });
  });

  it('missed several days: a fresh start, no rescue', () => {
    const g = decideGreeting(input({ active: [d(5), d(6), d(7)] }))!;
    expect(g.kind).toBe('fresh-start');
    expect(g.progress).toBeNull();
  });

  it('already practised today: only the quiet peace card, no call to action', () => {
    const g = decideGreeting(input({ active: [d(0), d(1)] }))!;
    expect(g.kind).toBe('done-quiet');
    expect(g.pose).toBe('peace');
    expect(g.cta).toBeNull();
  });

  describe('once per day', () => {
    it('does not repeat the daily greeting on the same server date', () => {
      expect(decideGreeting(input({ active: [d(1)], seen: { daily: TODAY } }))).toBeNull();
      expect(decideGreeting(input({ active: [d(0)], seen: { daily: TODAY } }))).toBeNull();
      expect(decideGreeting(input({ active: [], seen: { daily: TODAY } }))).toBeNull();
    });

    it('shows again the next day', () => {
      expect(decideGreeting(input({ active: [d(1)], seen: { daily: d(1) } }))).not.toBeNull();
    });
  });

  describe('evening nudge', () => {
    it('fires for an alive streak that still needs today, even after the morning greeting', () => {
      const g = decideGreeting(input({ active: [d(1), d(2)], localHour: EVENING_HOUR, seen: { daily: TODAY } }))!;
      expect(g.kind).toBe('evening-risk');
      expect(g.pose).toBe('worried');
      expect(g.marks).toEqual(['daily', 'evening']);
    });

    it('takes the place of the morning greeting when the first visit is already in the evening', () => {
      const g = decideGreeting(input({ active: [d(1), d(2)], localHour: 21 }))!;
      expect(g.kind).toBe('evening-risk');
      expect(g.marks).toContain('daily');
    });

    it('is shown once per day', () => {
      expect(
        decideGreeting(input({ active: [d(1)], localHour: 21, seen: { daily: TODAY, evening: TODAY } }))
      ).toBeNull();
    });

    it('does not fire before the evening hour', () => {
      const g = decideGreeting(input({ active: [d(1)], localHour: EVENING_HOUR - 1, seen: { daily: TODAY } }));
      expect(g).toBeNull();
    });

    it('does not fire when there is no streak to lose', () => {
      const g = decideGreeting(input({ active: [d(6)], localHour: 22, seen: { daily: TODAY } }));
      expect(g).toBeNull();
    });

    it('does not nag a student who already practised', () => {
      const g = decideGreeting(input({ active: [d(0), d(1)], localHour: 22, seen: { daily: TODAY } }));
      expect(g).toBeNull();
    });

    it('mentions the rescue when the missed day can still be won back', () => {
      const g = decideGreeting(
        input({ active: [d(2), d(3)], localHour: 20, seen: { daily: TODAY }, rescue: { answeredToday: 10, target: 100 } })
      )!;
      expect(g.kind).toBe('evening-risk');
      expect(g.headline).toContain('save');
      expect(g.progress).toEqual({ done: 10, total: 100 });
    });
  });
});

describe('Bueno copy', () => {
  it('the two low tiers use exactly the specified wording', () => {
    expect(RESULT_COPY.flat.main).toEqual(['You can do better.']);
    expect(RESULT_COPY.angry.main).toEqual(['Go Study.']);
  });

  it('every bank has at least one non-empty line', () => {
    const banks: readonly (readonly string[])[] = [
      SAVED_EXIT_LINES,
      SIGNED_OUT_LINES,
      POKE_LINES,
      ...Object.values(RESULT_COPY).flatMap((t) => [t.main, t.sub]),
    ];
    for (const bank of banks) {
      expect(bank.length).toBeGreaterThan(0);
      for (const line of bank) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('pick is deterministic and wraps, including negative and fractional seeds', () => {
    const bank = ['a', 'b', 'c'];
    expect(pick(bank, 0)).toBe('a');
    expect(pick(bank, 4)).toBe('b');
    expect(pick(bank, -2)).toBe('c');
    expect(pick(bank, 1.9)).toBe('b');
    expect(() => pick([], 0)).toThrow();
  });

  it('seedFromString is stable', () => {
    expect(seedFromString('2026-11-05')).toBe(seedFromString('2026-11-05'));
    expect(seedFromString('2026-11-05')).not.toBe(seedFromString('2026-11-06'));
  });

  describe('improvementLine', () => {
    it('celebrates a real improvement and gently notes a real drop', () => {
      expect(improvementLine(60, 72)).toBe('Up 12% from your last attempt in this chapter.');
      expect(improvementLine(80, 70)).toContain('Down 10%');
    });
    it('says nothing for small moves or when there is no previous attempt', () => {
      expect(improvementLine(70, 72)).toBeNull();
      expect(improvementLine(72, 70)).toBeNull();
      expect(improvementLine(null, 90)).toBeNull();
      expect(improvementLine(undefined, 90)).toBeNull();
      expect(improvementLine(Number.NaN, 90)).toBeNull();
    });
    it('treats exactly 5 points as worth mentioning', () => {
      expect(improvementLine(70, 75)).toContain('Up 5%');
    });
  });

  describe('streakCelebrationCopy', () => {
    it('a rescue is "Streak saved!"', () => {
      expect(streakCelebrationCopy({ streak: 5, rescued: true, milestoneDays: null }).headline).toBe('Streak saved!');
    });
    it('a milestone names the milestone, and 100 days graduates', () => {
      expect(streakCelebrationCopy({ streak: 7, rescued: false, milestoneDays: 7 }).headline).toBe('7-day streak!');
      expect(streakCelebrationCopy({ streak: 100, rescued: false, milestoneDays: 100 }).sub).toContain('graduate');
    });
    it('the first day starts a streak, later days extend it', () => {
      expect(streakCelebrationCopy({ streak: 1, rescued: false, milestoneDays: null }).headline).toBe('Streak started!');
      expect(streakCelebrationCopy({ streak: 5, rescued: false, milestoneDays: null }).headline).toBe('5-day streak!');
    });
  });
});
