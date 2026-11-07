import { chapterBackHref } from '@/lib/catalogue';

describe('chapterBackHref', () => {
  it('links to the subject page when everything is known', () => {
    expect(chapterBackHref({ yearNum: '2', moduleCode: '205', subjectSlug: 'anatomy' })).toBe(
      '/student/catalogue/2/205/anatomy'
    );
  });

  it('percent-encodes slugs with reserved characters', () => {
    expect(
      chapterBackHref({ yearNum: 3, moduleCode: '309', subjectSlug: 'microbiology-&-immunology' })
    ).toBe('/student/catalogue/3/309/microbiology-%26-immunology');
  });

  it('falls back to the module page without a subject slug', () => {
    expect(chapterBackHref({ yearNum: '1', moduleCode: '102', subjectSlug: null })).toBe(
      '/student/catalogue/1/102'
    );
  });

  it('falls back to the catalogue root without a year or module', () => {
    expect(chapterBackHref({ moduleCode: '102', subjectSlug: 'x' })).toBe('/student/catalogue');
    expect(chapterBackHref({ yearNum: '1', subjectSlug: 'x' })).toBe('/student/catalogue');
    expect(chapterBackHref({})).toBe('/student/catalogue');
  });
});
