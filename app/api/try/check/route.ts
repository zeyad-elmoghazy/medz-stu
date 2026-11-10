import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { tryLimiter } from '@/lib/rate-limit';
import { loadTryRows } from '@/lib/server/try-questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const BodySchema = z.object({
  questionId: z.number().int(),
  choice: z.string().min(1).max(64),
});

/**
 * POST /api/try/check  { questionId, choice }
 *
 * The public /try page (no account): checks one answer and returns the
 * verdict with the explanation. Public on purpose, but it only knows the
 * few questions /try features (lib/try-config.ts), so it cannot be used to
 * look up the answer to any other question; and it is limited per IP.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, tryLimiter);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: NO_STORE });
  }
  const { questionId, choice } = parsed.data;

  let rows;
  try {
    rows = await loadTryRows();
  } catch (err) {
    console.error('[try/check]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500, headers: NO_STORE });
  }
  const row = rows?.find((r) => r.id === questionId);
  if (!row) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404, headers: NO_STORE });
  }
  if (!row.choices.some((c) => c.id === choice)) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      isCorrect: choice === row.correct_answer,
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
    },
    { headers: NO_STORE }
  );
}
