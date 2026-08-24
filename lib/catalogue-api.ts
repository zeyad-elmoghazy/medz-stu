/**
 * Fetchers for the student-facing /api/student/catalogue/* surface.
 */

export type CatalogueModule = {
  code: string;
  name: string;
  chapterCount: number;
  publishedCount: number;
  subjectCount: number;
  subjectNames: string[];
};

export type CatalogueYear = {
  year: number;
  label: string;
  moduleCount: number;
  subjectCount: number;
  chapterCount: number;
  modules: CatalogueModule[];
};

export type ModulesByYear = {
  years: CatalogueYear[];
  totals: { modules: number; subjects: number; chapters: number };
};

export type CatalogueSubject = {
  slug: string;
  name: string;
  chapterCount: number;
  publishedCount: number;
};

export type SubjectsByModule = {
  moduleCode: string;
  moduleName: string;
  chapterTotal: number;
  publishedTotal: number;
  subjects: CatalogueSubject[];
};

export type CatalogueChapter = {
  id: string;
  slug: string;
  name: string;
  ordinal: number;
  publishedCount: number;
};

export type ChaptersBySubject = {
  moduleCode: string;
  moduleName: string;
  subjectSlug: string;
  subjectName: string;
  chapterTotal: number;
  publishedTotal: number;
  chapters: CatalogueChapter[];
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore — keep the generic HTTP status message */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchModulesByYear(): Promise<ModulesByYear> {
  const res = await fetch('/api/student/catalogue/modules-by-year', {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function fetchSubjectsByModule(code: string): Promise<SubjectsByModule> {
  const res = await fetch(
    `/api/student/catalogue/subjects-by-module?code=${encodeURIComponent(code)}`,
    { credentials: 'include', cache: 'no-store' }
  );
  return json(res);
}

export async function fetchChaptersBySubject(
  moduleCode: string,
  subjectSlug: string
): Promise<ChaptersBySubject> {
  const url = new URL('/api/student/catalogue/chapters-by-subject', window.location.origin);
  url.searchParams.set('moduleCode', moduleCode);
  url.searchParams.set('subjectSlug', subjectSlug);
  const res = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
  return json(res);
}
