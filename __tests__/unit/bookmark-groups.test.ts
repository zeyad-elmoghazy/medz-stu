import { groupBookmarks, type GroupableBookmark } from '@/lib/bookmark-groups';

type Item = GroupableBookmark & { id: string };

let counter = 0;
function bm(over: Partial<Item> = {}): Item {
  counter += 1;
  return {
    id: `b${counter}`,
    moduleCode: '205',
    moduleName: 'Nervous System',
    subjectId: 'subj-anatomy',
    subjectName: 'Anatomy',
    chapterName: 'Brain Stem',
    createdAt: '2026-11-01T10:00:00Z',
    ...over,
  };
}

const ids = (items: Item[]) => items.map((i) => i.id);

describe('groupBookmarks', () => {
  it('returns no groups for no bookmarks', () => {
    expect(groupBookmarks([])).toEqual([]);
  });

  it('groups by module then subject, with counts', () => {
    const groups = groupBookmarks([
      bm({ id: 'a1' }),
      bm({ id: 'a2' }),
      bm({ id: 'p1', subjectId: 'subj-phys', subjectName: 'Physiology' }),
      bm({ id: 'h1', moduleCode: '301', moduleName: 'Cardiology', subjectId: 'subj-histo', subjectName: 'Histology' }),
    ]);

    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Module 205 · Nervous System', 3],
      ['Module 301 · Cardiology', 1],
    ]);
    expect(groups[0].subjects.map((s) => [s.subjectName, ids(s.items).sort()])).toEqual([
      ['Anatomy', ['a1', 'a2']],
      ['Physiology', ['p1']],
    ]);
  });

  it('orders modules by code numerically, regardless of input order', () => {
    const groups = groupBookmarks([
      bm({ moduleCode: '301', moduleName: null }),
      bm({ moduleCode: '102', moduleName: null }),
      bm({ moduleCode: '205', moduleName: null }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Module 102', 'Module 205', 'Module 301']);
  });

  it('collapses placeholder module names to just the code', () => {
    const [g] = groupBookmarks([bm({ moduleCode: '102', moduleName: 'Module 102' })]);
    expect(g.label).toBe('Module 102');
  });

  it('orders subjects alphabetically within a module', () => {
    const [g] = groupBookmarks([
      bm({ subjectId: 's3', subjectName: 'Physiology' }),
      bm({ subjectId: 's1', subjectName: 'Anatomy' }),
      bm({ subjectId: 's2', subjectName: 'Histology' }),
    ]);
    expect(g.subjects.map((s) => s.subjectName)).toEqual(['Anatomy', 'Histology', 'Physiology']);
  });

  it('keeps chapters together (ascending), newest first within a chapter', () => {
    const [g] = groupBookmarks([
      bm({ id: 'cb-old', chapterName: 'Cerebellum', createdAt: '2026-10-01T00:00:00Z' }),
      bm({ id: 'bs-old', chapterName: 'Brain Stem', createdAt: '2026-10-02T00:00:00Z' }),
      bm({ id: 'cb-new', chapterName: 'Cerebellum', createdAt: '2026-10-20T00:00:00Z' }),
      bm({ id: 'bs-new', chapterName: 'Brain Stem', createdAt: '2026-10-25T00:00:00Z' }),
    ]);
    expect(ids(g.subjects[0].items)).toEqual(['bs-new', 'bs-old', 'cb-new', 'cb-old']);
  });

  it('sorts chapter names numerically (Chapter 2 before Chapter 10)', () => {
    const [g] = groupBookmarks([
      bm({ id: 'c10', chapterName: 'Chapter 10' }),
      bm({ id: 'c2', chapterName: 'Chapter 2' }),
    ]);
    expect(ids(g.subjects[0].items)).toEqual(['c2', 'c10']);
  });

  it('puts bookmarks with no chapter after chaptered ones in the same subject', () => {
    const [g] = groupBookmarks([
      bm({ id: 'none', chapterName: null }),
      bm({ id: 'has', chapterName: 'Brain Stem' }),
    ]);
    expect(ids(g.subjects[0].items)).toEqual(['has', 'none']);
  });

  it('puts unresolved bookmarks (question gone / no chapter) in a trailing "Other" group', () => {
    const groups = groupBookmarks([
      bm({
        id: 'orphan',
        moduleCode: null,
        moduleName: null,
        subjectId: null,
        subjectName: null,
        chapterName: null,
      }),
      bm({ id: 'ok', moduleCode: '999', moduleName: null }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Module 999', 'Other']);
    const other = groups[1];
    expect(other.count).toBe(1);
    expect(other.subjects.map((s) => s.subjectName)).toEqual(['Uncategorized']);
    expect(ids(other.subjects[0].items)).toEqual(['orphan']);
  });

  it('puts a module-resolved bookmark with no subject in a trailing "Uncategorized" subject', () => {
    const [g] = groupBookmarks([
      bm({ id: 'x', subjectId: null, subjectName: null }),
      bm({ id: 'y', subjectId: 's1', subjectName: 'Zoology' }),
    ]);
    expect(g.subjects.map((s) => s.subjectName)).toEqual(['Zoology', 'Uncategorized']);
  });

  it('keeps same-named subjects with different ids apart, and the same subject in two modules apart', () => {
    const groups = groupBookmarks([
      bm({ id: 'one', subjectId: 'id-1', subjectName: 'Anatomy' }),
      bm({ id: 'two', subjectId: 'id-2', subjectName: 'Anatomy' }),
      bm({ id: 'three', moduleCode: '301', moduleName: 'Cardiology', subjectId: 'id-1', subjectName: 'Anatomy' }),
    ]);
    expect(groups[0].subjects).toHaveLength(2);
    expect(groups[1].subjects).toHaveLength(1);
    const keys = groups.flatMap((g) => g.subjects.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses a module name from any of its bookmarks if the first one lacks it', () => {
    const [g] = groupBookmarks([bm({ moduleName: null }), bm({ moduleName: 'Nervous System' })]);
    expect(g.label).toBe('Module 205 · Nervous System');
  });

  it('does not mutate the input array or its items', () => {
    const input = [bm({ id: 'b', chapterName: 'B' }), bm({ id: 'a', chapterName: 'A' })];
    const snapshot = JSON.stringify(input);
    groupBookmarks(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('regroups cleanly after removals: counts drop and emptied groups disappear', () => {
    const items = [
      bm({ id: 'a' }),
      bm({ id: 'p', subjectId: 'subj-phys', subjectName: 'Physiology' }),
    ];
    expect(groupBookmarks(items)[0].count).toBe(2);

    const afterOne = groupBookmarks(items.filter((i) => i.id !== 'p'));
    expect(afterOne[0].count).toBe(1);
    expect(afterOne[0].subjects.map((s) => s.subjectName)).toEqual(['Anatomy']);

    expect(groupBookmarks([])).toEqual([]);
  });
});
