import { pickNextStep, type NextStepInput } from '@/lib/student/next-step';

const base: NextStepInput = {
  unfinished: [],
  lastPlayed: null,
  academicYear: null,
  currentModule: null,
};
const mod = { code: '205', href: '/student/catalogue/2/205', name: 'Central Nervous System' };

describe('pickNextStep (the spec for what students see first)', () => {
  it('resumes an unfinished chapter', () => {
    expect(
      pickNextStep({
        ...base,
        unfinished: [{ chapterId: 'c1', chapterName: 'Brain Stem', updatedAt: '2026-11-05T10:00:00Z' }],
        currentModule: mod,
      })
    ).toMatchObject({ kind: 'resume', href: '/student/quiz/chapter/c1', chapterId: 'c1' });
  });

  it('resumes the most recently touched attempt when there are several', () => {
    const step = pickNextStep({
      ...base,
      unfinished: [
        { chapterId: 'old', chapterName: 'Older', updatedAt: '2026-11-01T10:00:00Z' },
        { chapterId: 'new', chapterName: 'Newer', updatedAt: '2026-11-06T10:00:00Z' },
      ],
    });
    expect(step.chapterId).toBe('new');
  });

  it('names the chapter in the resume label', () => {
    const step = pickNextStep({
      ...base,
      unfinished: [{ chapterId: 'c1', chapterName: 'Brain Stem', updatedAt: '2026-11-05T10:00:00Z' }],
    });
    expect(step.label).toContain('Brain Stem');
  });

  it('moves on to the next chapter after the last one played', () => {
    expect(
      pickNextStep({
        ...base,
        lastPlayed: {
          chapterId: 'c1',
          subjectHref: '/student/catalogue/2/205/anatomy',
          nextChapterId: 'c2',
          nextChapterName: 'Cerebellum',
        },
        currentModule: mod,
      })
    ).toMatchObject({ kind: 'next-chapter', href: '/student/quiz/chapter/c2', chapterId: 'c2' });
  });

  it('prefers an unfinished attempt over the next chapter', () => {
    const step = pickNextStep({
      ...base,
      unfinished: [{ chapterId: 'c9', chapterName: 'Half done', updatedAt: '2026-11-05T10:00:00Z' }],
      lastPlayed: { chapterId: 'c1', subjectHref: '/x', nextChapterId: 'c2', nextChapterName: 'Next' },
    });
    expect(step.kind).toBe('resume');
  });

  it('falls back to the current module when the subject has no chapter left', () => {
    expect(
      pickNextStep({
        ...base,
        lastPlayed: { chapterId: 'c1', subjectHref: '/student/catalogue/2/205/anatomy' },
        academicYear: 2,
        currentModule: mod,
      })
    ).toMatchObject({ kind: 'module', href: mod.href });
  });

  it('starts a first-time student in their module', () => {
    const step = pickNextStep({ ...base, academicYear: 2, currentModule: mod });
    expect(step).toMatchObject({ kind: 'module', href: mod.href });
    expect(step.label).toContain('Central Nervous System');
  });

  it("falls back to the student's year, then to the catalogue", () => {
    expect(pickNextStep({ ...base, academicYear: 3 })).toMatchObject({
      kind: 'year',
      href: '/student/catalogue/3',
    });
    expect(pickNextStep(base)).toMatchObject({ kind: 'year', href: '/student/catalogue' });
  });
});
