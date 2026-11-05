import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { publicDbError } from '@/lib/api-error';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import { serviceRoleClient } from '@/lib/supabase-service';
import { getMascotStatus } from '@/lib/server/streak-status';
import { todayISODate } from '@/lib/streak-date';
import type { Database, UserRole } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/mascot/status
 *
 * Everything the daily greeting needs in one read-only call: the student's
 * streak state for the server's current day, and how far they are into the
 * 100-question rescue (only computed while a rescue is on the table).
 * Writes nothing, so merely opening the app can never change a streak.
 */
export async function GET() {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileQuery = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const profile = profileQuery.data as { role: UserRole } | null;
  if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = untypedFrom(serviceRoleClient());
    const status = await getMascotStatus(db, user.id, todayISODate());
    return NextResponse.json({ userId: user.id, ...status }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: publicDbError({ message: err instanceof Error ? err.message : 'unknown error' }) },
      { status: 500 }
    );
  }
}
