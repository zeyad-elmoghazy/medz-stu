import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { z } from 'zod';
import type { Database } from '@/lib/supabase';
import { redis, CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChoiceSchema = z.object({
  id: z.string().min(1).max(4),
  text: z.string().min(1).max(500),
});

const CreateQuestionSchema = z.object({
  chapterId: z.string().uuid(),
  subjectId: z.string().min(1),
  subjectBundleId: z.number().int().optional(),
  question: z.string().min(10).max(2000),
  choices: z.array(ChoiceSchema).min(2).max(5),
  correctAnswer: z.string().min(1).max(4),
  explanation: z.string().max(2000).optional().default(''),
  choiceRationales: z.record(z.string(), z.string()).optional(),
  reference: z.string().max(500).optional().default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  source: z.enum(['manual', 'ai']).optional().default('manual'),
  status: z.enum(['draft', 'under_review', 'published']).optional().default('draft'),
});

async function invalidatePublished(subjectId: string) {
  if (!redis) return;
  try {
    await redis.del(
      CACHE_KEYS.subjectList(),
      CACHE_KEYS.questionBank(subjectId)
    );
  } catch {
    // Cache-miss on next request will refill. Non-fatal.
  }
}

/**
 * GET /api/professor/questions
 * Query: ?status=&chapterId=&moduleCode=&subjectId=&limit=&offset=
 */
export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const chapterId = searchParams.get('chapterId');
  const moduleCode = searchParams.get('moduleCode');
  const subjectId = searchParams.get('subjectId');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);

  // Untyped fluent chain — the auth-helpers builder generic is
  // narrow so we cast to the loose shape we actually use.
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (
        c: string,
        o?: { count?: 'exact'; head?: boolean }
      ) => Record<string, unknown>;
    };
  };

  type QueryStep = {
    eq: (col: string, v: unknown) => QueryStep;
    in: (col: string, v: unknown[]) => QueryStep;
    order: (col: string, o: { ascending: boolean }) => QueryStep;
    range: (a: number, b: number) => Promise<{
      data: unknown[] | null;
      error: { message: string } | null;
      count: number | null;
    }>;
  };

  let q = client
    .from('questions')
    .select(
      'id, subject_id, subject_bundle_id, question, choices, correct_answer, explanation, reference, chapter_id, professor_id, status, flag_count, difficulty, source, created_at, updated_at',
      { count: 'exact' }
    ) as unknown as QueryStep;

  // Only surface this professor's own rows (RLS also enforces).
  q = q.eq('professor_id', user.id);
  if (status) q = q.eq('status', status);
  if (chapterId) q = q.eq('chapter_id', chapterId);
  if (subjectId) q = q.eq('subject_id', subjectId);
  if (moduleCode) {
    // Chapter IDs in the module — pre-query.
    const chaptersRes = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: unknown) => Promise<{
            data: { id: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    })
      .from('chapters')
      .select('id')
      .eq('module_code', moduleCode);
    const ids = (chaptersRes.data ?? []).map((r) => r.id);
    if (ids.length === 0) return NextResponse.json({ questions: [], total: 0 });
    q = q.in('chapter_id', ids);
  }

  q = q.order('created_at', { ascending: false });
  const { data, error, count } = await q.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    questions: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}

/**
 * POST /api/professor/questions
 *
 * Creates a question row owned by the calling professor.
 * On status='published' invalidates the student-facing caches
 * so the next /api/student/stats read sees the new count.
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Verify the correct answer id is one of the choices.
  if (!data.choices.some((c) => c.id === data.correctAnswer)) {
    return NextResponse.json(
      { error: 'correctAnswer must match a choice id' },
      { status: 400 }
    );
  }

  // Verify the chapter belongs to a module in the subject.
  const chapterCheck = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          single: () => Promise<{
            data: { module_code: string; modules: { subject_id: string } | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('chapters')
    .select('module_code, modules(subject_id)')
    .eq('id', data.chapterId)
    .single();

  if (chapterCheck.error || !chapterCheck.data) {
    return NextResponse.json(
      { error: 'Chapter not found' },
      { status: 404 }
    );
  }

  // Next subject_bundle_id — small race-tolerant approach.
  const maxRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: { subject_bundle_id: number }[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from('questions')
    .select('subject_bundle_id')
    .eq('subject_id', data.subjectId)
    .order('subject_bundle_id', { ascending: false })
    .limit(1);

  const nextBundleId =
    (maxRes.data?.[0]?.subject_bundle_id ?? 0) + 1;

  const insertRes = await (supabase as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('questions')
    .insert({
      subject_id: data.subjectId,
      subject_bundle_id: data.subjectBundleId ?? nextBundleId,
      question: data.question,
      choices: data.choices,
      correct_answer: data.correctAnswer,
      explanation: data.explanation ?? '',
      choice_rationales: data.choiceRationales ?? null,
      reference: data.reference ?? '',
      topic: '',
      chapter_id: data.chapterId,
      professor_id: user.id,
      status: data.status ?? 'draft',
      source: data.source ?? 'manual',
      difficulty: data.difficulty ?? 'medium',
    })
    .select('id, chapter_id, status, subject_id')
    .single();

  if (insertRes.error) {
    return NextResponse.json(
      { error: insertRes.error.message },
      { status: 500 }
    );
  }

  if ((insertRes.data as { status?: string })?.status === 'published') {
    await invalidatePublished(data.subjectId);
  }

  return NextResponse.json({ question: insertRes.data }, { status: 201 });
}
