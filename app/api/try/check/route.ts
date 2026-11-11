import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { tryLimiter } from '@/lib/rate-limit';
import { loadTrySample, toTryReveal } from '@/lib/server/try-questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const BodySchema = z.object({
  year: z.number().int(),
  questionId: z.number().int(),
  choice: z.string().min(1).max(64),
});

/**
 * POST /api/try/check  { year, questionId, choice }
 *
 * The public /try page (no account): checks one answer and returns the
 * verdict together with everything the student quiz shows after answering:
 * the explanation, a rationale for each choice, the topic and the book
 * reference (text + page; the page image comes from /api/try/reference-image).
 * Public on purpose, but it only knows the few questions /try features for
 * that year (lib/try-config.ts), so it cannot be used to look up the answer
 * to any other question; and it is limited per IP.
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
  const { year, questionId, choice } = parsed.data;

  let sample;
  try {
    sample = await loadTrySample(year);
  } catch (err) {
    console.error('[try/check]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500, headers: NO_STORE });
  }
  const row = sample?.rows.find((r) => r.id === questionId);
  if (!row) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404, headers: NO_STORE });
  }
  if (!row.choices.some((c) => c.id === choice)) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json(
    { isCorrect: choice === row.correct_answer, ...toTryReveal(row) },
    { headers: NO_STORE }
  );
}
