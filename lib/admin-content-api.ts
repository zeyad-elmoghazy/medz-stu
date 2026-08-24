/**
 * Fetchers for the /api/admin/content/* surface (the port from
 * b2c-pivot-rebuild) plus the standalone JSON import route.
 */

export type AdminModule = {
  code: string;
  name: string;
  year_num: string;
  year_label: string;
  is_active: boolean;
  book_id: string | null;
};

export type ModuleSubject = { id: string; slug: string; name: string };

export type ReferenceBook = { id: string; title: string };

export type AdminChapter = {
  id: string;
  module_code: string;
  subject_id: string;
  slug: string;
  name: string;
  ordinal: number;
  question_count: number;
  published_count: number;
  flagged_count: number;
  default_book_id: string | null;
  default_page_start: number | null;
};

export type AdminQuestion = {
  id: number;
  question: string;
  choices: { id: string; text: string }[];
  correct_answer: string;
  explanation: string;
  reference: string;
  reference_page: number | null;
  status: 'draft' | 'under_review' | 'published' | 'archived';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  source: string | null;
  flag_count: number;
  professor_id: string | null;
  created_at: string;
  updated_at: string;
  chapter_id: string | null;
  chapters: { name: string; module_code: string; subject_id: string; subjects: { name: string } | null } | null;
  referenceImageUrl: string | null;
};

export type AdminOverview = {
  counts: {
    students: number;
    admins: number;
    modules: number;
    subjects: number;
    chapters: number;
    questions: {
      published: number;
      under_review: number;
      draft: number;
      archived: number;
      total: number;
    };
  };
  dauTrend: { date: string; activeStudents: number }[];
  recentActivity: {
    id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    summary: string;
    created_at: string;
    profiles: { full_name: string | null; email: string | null } | null;
  }[];
  authorActivity: {
    id: string;
    full_name: string | null;
    email: string | null;
    joined_at: string;
    stats: {
      draft: number;
      under_review: number;
      published: number;
      archived: number;
      flagged: number;
      last_activity: string | null;
    };
  }[];
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || j.message || msg;
    } catch {
      // no body
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function fetchOverview(): Promise<AdminOverview> {
  const res = await fetch('/api/admin/content/overview', { credentials: 'include', cache: 'no-store' });
  return json(res);
}

export async function fetchAdminModules(): Promise<{ modules: AdminModule[] }> {
  const res = await fetch('/api/admin/content/modules', { credentials: 'include', cache: 'no-store' });
  return json(res);
}

export async function fetchReferenceBooks(): Promise<{ books: ReferenceBook[] }> {
  const res = await fetch('/api/admin/content/books', { credentials: 'include', cache: 'no-store' });
  return json(res);
}

export async function patchAdminModule(
  code: string,
  body: { book_id: string | null }
): Promise<{ module: AdminModule }> {
  const res = await fetch(`/api/admin/content/modules/${code}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function fetchModuleSubjects(moduleCode: string): Promise<{ subjects: ModuleSubject[] }> {
  const res = await fetch(`/api/admin/content/modules/${moduleCode}/subjects`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function fetchAdminChapters(
  moduleCode: string,
  subjectId: string
): Promise<{ chapters: AdminChapter[] }> {
  const qs = new URLSearchParams({ moduleCode, subjectId });
  const res = await fetch(`/api/admin/content/chapters?${qs.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function createAdminChapter(body: {
  moduleCode: string;
  subjectId: string;
  name: string;
}): Promise<{ chapter: { id: string; module_code: string; subject_id: string; slug: string; name: string; ordinal: number } }> {
  const res = await fetch('/api/admin/content/chapters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function fetchAdminQuestions(params: {
  status?: string;
  chapterId?: string;
  moduleCode?: string;
  subjectId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ questions: AdminQuestion[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`/api/admin/content/questions?${qs.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function createAdminQuestion(body: {
  chapterId: string;
  question: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  explanation?: string;
  choiceRationales?: Record<string, string>;
  referencePage?: number;
  reference?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  status?: 'draft' | 'under_review' | 'published';
}): Promise<{ question: { id: number } }> {
  const res = await fetch('/api/admin/content/questions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function patchAdminQuestion(
  id: number,
  body: Partial<{
    status: 'draft' | 'under_review' | 'published' | 'archived';
    question: string;
    choices: { id: string; text: string }[];
    correctAnswer: string;
    explanation: string;
    reference: string;
    referencePage: number | null;
    chapterId: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>
): Promise<{ question: { id: number; status: string } }> {
  const res = await fetch(`/api/admin/content/questions/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function uploadPdfForExtraction(form: FormData): Promise<{
  jobId: string;
  extracted: number;
  error?: string;
  insertedIds?: number[];
  extractionSource?: string;
}> {
  const res = await fetch('/api/admin/content/upload', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as {
    jobId: string;
    extracted: number;
    error?: string;
    insertedIds?: number[];
    extractionSource?: string;
  };
  // Both success (200) and "zero extracted" (422) return a real,
  // readable body — the caller decides what to show, same honesty
  // requirement as the upload_jobs status surfacing.
  if (!res.ok && res.status !== 422) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export async function importQuestionsJson(body: {
  moduleCode: string;
  chapterId: string;
  data: unknown;
}): Promise<{ imported: number; questionIds: number[] }> {
  const res = await fetch('/api/admin/questions/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}
