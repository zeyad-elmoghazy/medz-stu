import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { getExamPlan } from '@/lib/student/exam-plan-load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/exam-plan
 *
 * The Home countdown: days to the student's nearest exam and how many questions
 * a day get them through what is left. `examPlan` is null (and Home shows
 * nothing) until exam dates are filled in lib/exam-schedule.ts. Read with the
 * student's own session, so RLS decides what they can see.
 *
 * Auth: any signed-in user, same if(!user)-only pattern as /api/student/next-step.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const examPlan = await getExamPlan(supabase, user.id);
  return NextResponse.json({ examPlan }, { headers: { 'Cache-Control': 'private, no-store' } });
}
