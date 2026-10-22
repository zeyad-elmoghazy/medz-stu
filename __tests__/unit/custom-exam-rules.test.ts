import {
  availableQuestionCount,
  clampQuestionCount,
  pruneChapterSelection,
  quickCountOptions,
  allChapterIds,
  type ExamSubjectOption,
} from '@/lib/custom-exam-rules';

const subjects: ExamSubjectOption[] = [
  {
    id: 's-hist',
    slug: 'histology',
    name: 'Histology',
    publishedCount: 12,
    chapters: [
      { id: 'c1', name: 'Epithelium', ordinal: 1, publishedCount: 5 },
      { id: 'c2', name: 'Connective tissue', ordinal: 2, publishedCount: 7 },
      { id: 'c3', name: 'Empty chapter', ordinal: 3, publishedCount: 0 },
    ],
  },
  {
    id: 's-anat',
    slug: 'anatomy',
    name: 'Anatomy',
    publishedCount: 30,
    chapters: [
      { id: 'c4', name: 'Thorax', ordinal: 1, publishedCount: 30 },
    ],
  },
  {
    id: 's-empty',
    slug: 'physiology',
    name: 'Physiology',
    publishedCount: 0,
    chapters: [{ id: 'c5', name: 'Nothing yet', ordinal: 1, publishedCount: 0 }],
  },
];

describe('availableQuestionCount', () => {
  test('sums published counts of selected chapters inside selected subjects', () => {
    expect(availableQuestionCount(subjects, ['s-hist'], ['c1', 'c2'])).toBe(12);
    expect(availableQuestionCount(subjects, ['s-hist', 's-anat'], ['c1', 'c4'])).toBe(35);
  });

  test('ignores chapters whose subject is not selected', () => {
    expect(availableQuestionCount(subjects, ['s-hist'], ['c1', 'c4'])).toBe(5);
  });

  test('is zero with nothing selected', () => {
    expect(availableQuestionCount(subjects, [], [])).toBe(0);
    expect(availableQuestionCount(subjects, ['s-hist'], [])).toBe(0);
    expect(availableQuestionCount(subjects, [], ['c1'])).toBe(0);
  });

  test('counts a chapter once even if listed twice', () => {
    expect(availableQuestionCount(subjects, ['s-hist'], ['c1', 'c1'])).toBe(5);
  });

  test('unknown ids contribute nothing', () => {
    expect(availableQuestionCount(subjects, ['nope'], ['zzz'])).toBe(0);
  });
});

describe('clampQuestionCount', () => {
  test('never exceeds the available maximum', () => {
    expect(clampQuestionCount(500, 12)).toBe(12);
    expect(clampQuestionCount(13, 12)).toBe(12);
    expect(clampQuestionCount(12, 12)).toBe(12);
  });

  test('never goes below 1 when something is available', () => {
    expect(clampQuestionCount(0, 12)).toBe(1);
    expect(clampQuestionCount(-4, 12)).toBe(1);
  });

  test('is 0 when nothing is available', () => {
    expect(clampQuestionCount(10, 0)).toBe(0);
    expect(clampQuestionCount(10, -3)).toBe(0);
  });

  test('truncates fractions and survives non-finite input', () => {
    expect(clampQuestionCount(7.9, 12)).toBe(7);
    expect(clampQuestionCount(Number.NaN, 12)).toBe(1);
    expect(clampQuestionCount(Number.POSITIVE_INFINITY, 12)).toBe(12);
  });
});

describe('quickCountOptions', () => {
  test('offers presets that fit, plus the maximum as "all"', () => {
    expect(quickCountOptions(25)).toEqual([10, 20, 25]);
    expect(quickCountOptions(50)).toEqual([10, 20, 30, 50]);
    expect(quickCountOptions(80)).toEqual([10, 20, 30, 50, 80]);
  });

  test('small pools collapse to just the maximum', () => {
    expect(quickCountOptions(7)).toEqual([7]);
    expect(quickCountOptions(10)).toEqual([10]);
    expect(quickCountOptions(1)).toEqual([1]);
  });

  test('is empty when nothing is available', () => {
    expect(quickCountOptions(0)).toEqual([]);
  });
});

describe('pruneChapterSelection', () => {
  test('drops chapters whose subject was deselected', () => {
    expect(pruneChapterSelection(subjects, ['s-hist'], ['c1', 'c4'])).toEqual(['c1']);
  });

  test('keeps order and drops unknown ids', () => {
    expect(pruneChapterSelection(subjects, ['s-hist', 's-anat'], ['c4', 'c1', 'ghost'])).toEqual([
      'c4',
      'c1',
    ]);
  });
});

describe('allChapterIds', () => {
  test('selects every chapter with questions inside the given subjects', () => {
    expect(allChapterIds(subjects, ['s-hist'])).toEqual(['c1', 'c2']);
    expect(allChapterIds(subjects, ['s-hist', 's-anat'])).toEqual(['c1', 'c2', 'c4']);
  });

  test('skips chapters with no published questions', () => {
    expect(allChapterIds(subjects, ['s-empty'])).toEqual([]);
  });
});
