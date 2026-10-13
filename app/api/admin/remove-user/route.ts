import { NextRequest } from 'next/server';
import { handleRemoveUser } from '@/lib/admin-remove-user-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/remove-user  { targetUserId: uuid }
 *
 * Hard-removes a STUDENT account (login, profile and all their data).
 * Same behaviour as /api/admin/content/remove-user — both delegate to
 * lib/admin-remove-user-handler.ts. Admin-only.
 */
export async function POST(request: NextRequest) {
  return handleRemoveUser(request);
}
