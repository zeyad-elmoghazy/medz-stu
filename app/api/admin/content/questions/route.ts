import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import { logActivity } from '@/lib/admin-activity';
import { invalidateCache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content/questions
 *
 * Backs both Content Library and Review Queue — same endpoint,
 * different `status` filter from the caller:
 *   - Content Library: no status param (or status=all) → every
 *     question regardless of status, including already-published
 *     ones, directly editable.
 *   - Review Queue: status=draft,under_review → items awaiting
 *     first publish.
 *
 * REWRITTEN from the b2c-pivot-rebuild source for the module-owns-
 * the-book redesign: no reference_book_id anywhere (dead column —
 * see 019_module_book_and_import_idempotency.sql), and the
 * response resolves each question's reference into an actual
 * viewable image via the shared getSignedBookPageUrl() resolver —
 * a reviewer needs to see the page, not just a raw page number, to
 * satisfy "review the references before publish."
 *
 * Query params: status (CSV), moduleCode, subjectId, chapterId,
 * search (keyword, matches question text), limit, offset.
 */
export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const statuses = statusParam && statusParam !== 'all' ? statusParam.split(',').filter(Boolean) : null;
  const moduleCode = searchParams.get('moduleCode');
  const subjectId = searchParams.get('subjectId');
  const chapterId = searchParams.get('chapterId');
  const search = searchParams.get('search');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);

  let chapterIds: string[] | null = chapterId ? [chapterId] : null;
  if (!chapterId && (moduleCode || subjectId)) {
    let chapterQuery = untypedFrom(supabase).from('chapters').select('id');
    if (moduleCode) chapterQuery = chapterQuery.eq('module_code', moduleCode);
    if (subjectId) chapterQuery = chapterQuery.eq('subject_id', subjectId);
    const chapterRes = await chapterQuery;
    if (chapterRes.error) return NextResponse.json({ error: chapterRes.error.message }, { status: 500 });
    chapterIds = ((chapterRes.data ?? []) as { id: string }[]).map((c) => c.id);
    if (chapterIds.length === 0) {
      return NextResponse.json({ questions: [], total: 0, limit, offset });
    }
  }

  let query = untypedFrom(supabase)
    .from('questions')
    .select(
      'id, question, choices, correct_answer, explanation, reference, reference_page, status, difficulty, source, flag_count, professor_id, created_at, updated_at, chapter_id, chapters(name, module_code, subject_id, subjects(name))',
      { count: 'exact' }
    );

  if (statuses) query = query.in('status', statuses);
  if (chapterIds) query = query.in('chapter_id', chapterIds);
  if (search) query = query.ilike('question', `%${search}%`);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const { getSignedBookPageUrl } = await import('@/lib/book-reference');
  const rows = (data ?? []) as { chapter_id: string | null; reference_page: number | null }[];
  const questions = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      referenceImageUrl: await getSignedBookPageUrl(r.chapter_id, r.reference_page),
    }))
  );

  return NextResponse.json({ questions, total: count ?? 0, limit, offset });
}

const ChoiceSchema = z.object({ id: z.string().min(1).max(4), text: z.string().min(1).max(500) });

const CreateQuestionSchema = z.object({
  chapterId: z.string().uuid(),
  question: z.string().min(10).max(2000),
  choices: z.array(ChoiceSchema).min(2).max(5),
  correctAnswer: z.string().min(1).max(4),
  explanation: z.string().max(2000).optional().default(''),
  choiceRationales: z.record(z.string(), z.string()).optional(),
  referencePage: z.number().int().min(1).optional(),
  reference: z.string().max(500).optional().default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  status: z.enum(['draft', 'under_review', 'published']).optional().default('draft'),
});

/**
 * POST /api/admin/content/questions
 *
 * Manual MCQ Entry. REWRITTEN: no referenceBookId field and no
 * chapter-default-book fallback — the module already owns its
 * book (modules.book_id), so this route only ever writes
 * reference_page, taken directly from the caller.
 */
export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (!d.choices.some((c) => c.id === d.correctAnswer)) {
    return NextResponse.json({ error: 'correctAnswer must match a choice id' }, { status: 400 });
  }

  const chapterRes = await untypedFrom(supabase)
    .from('chapters')
    .select('module_code, subject_id, subjects(slug)')
    .eq('id', d.chapterId)
    .single();
  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = chapterRes.data as {
    module_code: string;
    subject_id: string;
    subjects: { slug: string } | null;
  };

  const subjectSlug = chapter.subjects?.slug ?? 'general';

  // Legacy subject_id/subject_bundle_id columns are still NOT NULL
  // + UNIQUE(subject_id, subject_bundle_id) from 001_initial_schema.
  // chapter_id is the real scope now; these are populated only to
  // satisfy that constraint, not read anywhere in the new taxonomy.
  const maxRes = await untypedFrom(supabase)
    .from('questions')
    .select('subject_bundle_id')
    .eq('subject_id', subjectSlug)
    .order('subject_bundle_id', { ascending: false })
    .limit(1);
  const nextBundleId = ((maxRes.data as { subject_bundle_id: number }[] | null)?.[0]?.subject_bundle_id ?? 0) + 1;

  const { data: inserted, error: dbError } = await untypedFrom(supabase)
    .from('questions')
    .insert({
      subject_id: subjectSlug,
      subject_bundle_id: nextBundleId,
      question: d.question,
      choices: d.choices,
      correct_answer: d.correctAnswer,
      explanation: d.explanation ?? '',
      choice_rationales: d.choiceRationales ?? null,
      reference: d.reference ?? '',
      reference_page: d.referencePage ?? null,
      topic: '',
      chapter_id: d.chapterId,
      professor_id: user.id, // legacy column name — now always an admin (Zoz/Ammar)
      status: d.status,
      source: 'manual',
      difficulty: d.difficulty,
    })
    .select('id, chapter_id, status')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const questionId = String((inserted as { id: number }).id);

  await logActivity(supabase, {
    actorId: user.id,
    action: d.status === 'published' ? 'question_published' : 'question_created',
    entityType: 'question',
    entityId: questionId,
    summary: `${d.status === 'published' ? 'Published' : 'Created'} question in Module ${chapter.module_code}`,
  });

  if (d.status === 'published') {
    await invalidateCache(CACHE_KEYS.subjectList(), CACHE_KEYS.questionBank(subjectSlug));
  }

  return NextResponse.json({ question: inserted }, { status: 201 });
}
