/**
 * Shared professor-side types + fetchers.
 * All numbers here come from the DB — no hardcoded fallbacks.
 */

export type ProfessorStats = {
  my_students: number;
  total_students: number;
  total_questions: number;
  published_questions: number;
  draft_questions: number;
  under_review: number;
  flagged_questions: number;
  total_attempts: number;
  sessions_this_week: number;
  avg_accuracy: number;
  modules: Array<{
    code: string;
    name: string;
    subject_id: string;
    year_num: string;
    year_label: string;
    is_active: boolean;
    chapter_count: number;
    question_count: number;
    published_count: number;
  }>;
  chapter_performance: Array<{
    id: string;
    name: string;
    module_code: string;
    published_count: number;
    avg_accuracy: number;
  }>;
  recent_activity: Array<{
    kind: string;
    at: string;
    actor: string | null;
    subject: string;
    accuracy: number;
  }>;
  recent_uploads: Array<{
    id: string;
    module_code: string | null;
    chapter_id: string | null;
    method: string;
    status: string;
    questions_extracted: number;
    questions_published: number;
    created_at: string;
  }>;
};

export type ModuleWithChapters = {
  code: string;
  subject_id: string;
  name: string;
  year_num: string;
  year_label: string;
  is_active: boolean;
  chapters: Array<{
    id: string;
    slug: string;
    name: string;
    ordinal: number;
    question_count: number;
    published_count: number;
    flagged_count: number;
  }>;
};

export type ProfessorQuestion = {
  id: number;
  subject_id: string;
  subject_bundle_id: number;
  question: string;
  choices: Array<{ id: string; text: string }>;
  correct_answer: string;
  explanation: string;
  reference: string;
  chapter_id: string | null;
  professor_id: string | null;
  status: 'draft' | 'under_review' | 'published' | 'archived';
  flag_count: number;
  difficulty: 'easy' | 'medium' | 'hard';
  source: 'manual' | 'ai' | 'seed';
  created_at: string;
  updated_at: string;
};

export type UploadJob = {
  id: string;
  module_code: string | null;
  chapter_id: string | null;
  method: 'ai' | 'manual' | 'import';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  questions_extracted: number;
  questions_published: number;
  questions_under_review: number;
  notes_file_name: string | null;
  questions_file_name: string | null;
  created_at: string;
  completed_at: string | null;
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

export async function fetchProfessorStats(): Promise<{
  profile: { id: string; full_name: string | null; email: string | null };
  stats: ProfessorStats;
}> {
  const res = await fetch('/api/professor/stats', {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function fetchModules(): Promise<{ modules: ModuleWithChapters[] }> {
  const res = await fetch('/api/professor/modules', {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function fetchQuestions(params: {
  status?: string;
  chapterId?: string;
  moduleCode?: string;
  subjectId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  questions: ProfessorQuestion[];
  total: number;
  limit: number;
  offset: number;
}> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`/api/professor/questions?${qs.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return json(res);
}

export async function createQuestion(body: {
  chapterId: string;
  subjectId: string;
  question: string;
  choices: Array<{ id: string; text: string }>;
  correctAnswer: string;
  explanation?: string;
  reference?: string;
  status?: 'draft' | 'under_review' | 'published';
  source?: 'manual' | 'ai';
  difficulty?: 'easy' | 'medium' | 'hard';
}): Promise<{ question: { id: number } }> {
  const res = await fetch('/api/professor/questions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function patchQuestion(
  id: number,
  body: Partial<{
    status: 'draft' | 'under_review' | 'published' | 'archived';
    question: string;
    choices: Array<{ id: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    reference: string;
    chapterId: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>
): Promise<{ question: { id: number; status: string } }> {
  const res = await fetch(`/api/professor/questions/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function createChapter(body: {
  moduleCode: string;
  name: string;
}): Promise<{ chapter: { id: string; name: string; slug: string } }> {
  const res = await fetch('/api/professor/chapters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function createUploadJob(body: {
  moduleCode: string;
  chapterId: string;
  method: 'ai' | 'manual' | 'import';
  notesFileName?: string;
  questionsFileName?: string;
}): Promise<{ job: { id: string; status: string } }> {
  const res = await fetch('/api/professor/upload-jobs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

export async function patchUploadJob(
  id: string,
  body: Partial<{
    status: 'queued' | 'processing' | 'completed' | 'failed';
    questionsExtracted: number;
    questionsPublished: number;
    questionsUnderReview: number;
    errorMessage: string;
  }>
): Promise<{ job: { id: string; status: string } }> {
  const res = await fetch(`/api/professor/upload-jobs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}
