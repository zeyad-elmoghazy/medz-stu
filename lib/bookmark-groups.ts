import { moduleLabel } from '@/lib/dashboard-data';

/** The slice of a bookmark the grouping needs (the API's list-mode shape). */
export type GroupableBookmark = {
  moduleCode: string | null;
  moduleName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  chapterName: string | null;
  createdAt: string;
};

export type SubjectGroup<T> = {
  /** Unique within the page (includes the module) — safe as a React key / collapse key. */
  key: string;
  subjectName: string;
  items: T[];
};

export type ModuleGroup<T> = {
  key: string;
  /** "Module 205 · Name", "Module 102", or "Other" for unresolved bookmarks. */
  label: string;
  /** Total bookmarks across all of the module's subjects. */
  count: number;
  subjects: SubjectGroup<T>[];
};

const OTHER_KEY = '__other__';
const OTHER_LABEL = 'Other';
const NO_SUBJECT_LABEL = 'Uncategorized';

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Ascending, with null always last. */
function compareNullableText(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compareText(a, b);
}

/**
 * Organise a student's bookmarks Module › Subject for exam revision.
 *
 *  - Modules ascend by code ("102" before "205"); unresolved bookmarks
 *    (question unpublished/deleted, or not attached to a chapter) land in a
 *    trailing "Other" group so they are never hidden and can still be removed.
 *  - Subjects ascend by name inside a module; a module-resolved bookmark whose
 *    subject can't be resolved goes to a trailing "Uncategorized" subject.
 *  - Inside a subject, chapters cluster together (ascending), newest first
 *    within a chapter.
 *
 * Pure: the result depends only on the items, so removing one and
 * regrouping yields the same shape minus that item.
 */
export function groupBookmarks<T extends GroupableBookmark>(items: T[]): ModuleGroup<T>[] {
  type SubjectAcc = { key: string; name: string | null; items: T[] };
  type ModuleAcc = {
    key: string;
    code: string | null;
    name: string | null;
    subjects: Map<string, SubjectAcc>;
  };
  const modules = new Map<string, ModuleAcc>();

  for (const item of items) {
    const moduleKey = item.moduleCode ?? OTHER_KEY;
    let mod = modules.get(moduleKey);
    if (!mod) {
      mod = { key: moduleKey, code: item.moduleCode, name: item.moduleName, subjects: new Map() };
      modules.set(moduleKey, mod);
    } else if (!mod.name && item.moduleName) {
      mod.name = item.moduleName;
    }

    // Prefer the id (stable even if two subjects share a name); fall back to the name.
    const subjectKey = `${moduleKey}::${item.subjectId ?? item.subjectName ?? OTHER_KEY}`;
    let subject = mod.subjects.get(subjectKey);
    if (!subject) {
      subject = { key: subjectKey, name: item.subjectName, items: [] };
      mod.subjects.set(subjectKey, subject);
    }
    subject.items.push(item);
  }

  const compareItems = (a: T, b: T) =>
    compareNullableText(a.chapterName, b.chapterName) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt);

  return Array.from(modules.values())
    .sort((a, b) => compareNullableText(a.code, b.code))
    .map((mod) => {
      const subjects: SubjectGroup<T>[] = Array.from(mod.subjects.values())
        .sort((a, b) => compareNullableText(a.name, b.name))
        .map((s) => ({
          key: s.key,
          subjectName: s.name ?? NO_SUBJECT_LABEL,
          items: [...s.items].sort(compareItems),
        }));
      return {
        key: mod.key,
        label: mod.code === null ? OTHER_LABEL : moduleLabel(mod.code, mod.name),
        count: subjects.reduce((n, s) => n + s.items.length, 0),
        subjects,
      };
    });
}
