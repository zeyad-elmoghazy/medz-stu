import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import { getNextStep } from '@/lib/student/next-step';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/next-step
 *
 * The one thing Home suggests: resume an unfinished chapter, move on to the
 * next one, start in the student's module, or browse their year. Read with the
 * student's own session, so RLS decides what they can see.
 *
 * Auth: any signed-in user, same if(!user)-only pattern as /api/student/stats.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nextStep = await getNextStep(supabase, user.id);
  return NextResponse.json({ nextStep }, { headers: { 'Cache-Control': 'private, no-store' } });
}
