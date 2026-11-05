import {
  accuracyTrend,
  largestVolumeMilestone,
  pickProudMessage,
  type ProudInput,
} from '@/lib/mascot/proud';

function base(over: Partial<ProudInput> = {}): ProudInput {
  return {
    totalQuestionsAnswered: 120,
    overallAccuracy: 60,
    streakDays: 0,
    progressHistory: [],
    mistakesToReview: 0,
    ...over,
  };
}

const hist = (...accs: number[]) => accs.map((accuracy) => ({ accuracy }));

describe('accuracyTrend', () => {
  it('needs at least six sessions', () => {
    expect(accuracyTrend(hist(50, 60, 70, 80, 90))).toBeNull();
  });
  it('compares the last three sessions with the three before', () => {
    expect(accuracyTrend(hist(50, 50, 50, 60, 60, 60))).toBeCloseTo(10);
    expect(accuracyTrend(hist(90, 90, 90, 60, 60, 60))).toBeCloseTo(-30);
  });
  it('only looks at the most recent six', () => {
    expect(accuracyTrend(hist(0, 0, 50, 50, 50, 60, 60, 60))).toBeCloseTo(10);
  });
});

describe('largestVolumeMilestone', () => {
  it.each([
    [0, null],
    [99, null],
    [100, 100],
    [249, 100],
    [250, 250],
    [999, 500],
    [1000, 1000],
    [9999, 5000],
  ])('%i questions -> %s', (total, expected) => {
    expect(largestVolumeMilestone(total)).toBe(expected);
  });
});

describe('pickProudMessage', () => {
  it('a student with no answers gets an invitation, not praise', () => {
    const m = pickProudMessage(base({ totalQuestionsAnswered: 0 }));
    expect(m.kind).toBe('first');
    expect(m.pose).toBe('rest');
  });

  it('a 7+ day streak is the headline', () => {
    const m = pickProudMessage(base({ streakDays: 9, overallAccuracy: 95 }));
    expect(m.kind).toBe('streak');
    expect(m.headline).toBe('9 days in a row!');
    expect(m.pose).toBe('proud');
  });

  it('exactly 7 days already counts as a streak worth being proud of', () => {
    const m = pickProudMessage(base({ streakDays: 7 }));
    expect(m.kind).toBe('streak');
    expect(m.headline).toBe('7 days in a row!');
  });

  it('a 6-day streak is not enough to win the headline', () => {
    expect(pickProudMessage(base({ streakDays: 6 })).kind).not.toBe('streak');
  });

  it('an improving trend beats high accuracy', () => {
    const m = pickProudMessage(
      base({ overallAccuracy: 85, progressHistory: hist(50, 50, 50, 70, 70, 70) })
    );
    expect(m.kind).toBe('trend');
    expect(m.headline).toBe('Your accuracy is up 20%');
  });

  it('a flat or falling trend does not trigger the trend message', () => {
    expect(pickProudMessage(base({ progressHistory: hist(70, 70, 70, 71, 71, 71) })).kind).not.toBe('trend');
    expect(pickProudMessage(base({ progressHistory: hist(80, 80, 80, 60, 60, 60) })).kind).not.toBe('trend');
  });

  it('high accuracy needs a real sample (50+ questions)', () => {
    expect(pickProudMessage(base({ totalQuestionsAnswered: 49, overallAccuracy: 95 })).kind).not.toBe('accuracy');
    const m = pickProudMessage(base({ totalQuestionsAnswered: 50, overallAccuracy: 95, progressHistory: [] }));
    expect(m.kind).toBe('accuracy');
    expect(m.headline).toBe('95% accuracy overall');
  });

  it('falls back to the volume milestone, then to a steady message', () => {
    const v = pickProudMessage(base({ totalQuestionsAnswered: 1200, overallAccuracy: 55 }));
    expect(v.kind).toBe('volume');
    expect(v.headline).toBe('1,200 questions answered');
    expect(v.body).toContain('1,000');
    const s = pickProudMessage(base({ totalQuestionsAnswered: 30, overallAccuracy: 55 }), 1);
    expect(s.kind).toBe('steady');
  });

  it('never returns an empty headline or body', () => {
    const cases: ProudInput[] = [
      base({ totalQuestionsAnswered: 0 }),
      base({ streakDays: 10 }),
      base({ progressHistory: hist(1, 1, 1, 9, 9, 9) }),
      base({ totalQuestionsAnswered: 80, overallAccuracy: 90 }),
      base({ totalQuestionsAnswered: 600 }),
      base({ totalQuestionsAnswered: 20 }),
    ];
    for (const c of cases) {
      const m = pickProudMessage(c);
      expect(m.headline.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
    }
  });
});
