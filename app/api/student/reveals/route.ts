import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { progressLimiter } from '@/lib/rate-limit';
import { NO_STORE, authenticateStudent, serviceClient } from '@/lib/server/custom-exam-db';
import { gatedReveals, revealsToJson } from '@/lib/server/reveal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/student/reveals  { questionIds: number[] }  (at most 200)
 *
 * The answers, explanations and references of questions this student has
 * ALREADY been shown (answered through the answer endpoints, migration 049).
 * Used by the results pages to fill in the per-question breakdown. A
 * question that was never revealed to this student is simply absent from the
 * response, so this cannot be used to look an answer up.
 */

const BodySchema = z.object({
  questionIds: z.array(z.number().int()).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateStudent(request, progressLimiter);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { reveals, error } = await gatedReveals(
    serviceClient(),
    auth.user.id,
    parsed.data.questionIds
  );
  if (error) return NextResponse.json({ error }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ reveals: revealsToJson(reveals) }, { headers: NO_STORE });
}
