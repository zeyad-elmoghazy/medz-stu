/**
 * Seed Dr. Zahra's professor account.
 *
 *   npm run seed:professor
 *
 * Idempotent — safe to re-run. Creates the auth user, upserts
 * the profile row with role='professor', and assigns her as the
 * professor of every histology module.
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (admin API needs this)
 */

import { createClient } from '@supabase/supabase-js';

const EMAIL = 'zahra@medz.co';
const PASSWORD = '12345678';
const FULL_NAME = 'Dr. Ahmed Zahra';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Ensure the auth user exists. listUsers() over 1 page is
  //    enough for a demo — a real project would page.
  const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  let userId: string | null = null;
  const match = existing.users.find((u) => u.email?.toLowerCase() === EMAIL);
  if (match) {
    userId = match.id;
    // Reset password so the demo always logs in with the known one.
    await admin.auth.admin.updateUserById(match.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    console.log(`↺ existing user ${EMAIL} (${userId}) — password reset`);
  } else {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: FULL_NAME },
      });
    if (createErr) throw createErr;
    userId = created.user.id;
    console.log(`✓ created user ${EMAIL} (${userId})`);
  }
  if (!userId) throw new Error('failed to resolve user id');

  // 2) Upsert profile row with role='professor'.
  const { error: profErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        full_name: FULL_NAME,
        email: EMAIL,
        role: 'professor',
      },
      { onConflict: 'id' }
    );
  if (profErr) throw profErr;
  console.log('✓ profile upserted as professor');

  // 3) Assign her to every histology module. Requires migration
  //    007 to have run.
  const { error: modErr } = await admin
    .from('modules')
    .update({ professor_id: userId })
    .eq('subject_id', 'histology');
  if (modErr) throw modErr;
  console.log('✓ assigned as professor of every histology module');

  console.log('\nDone. Log in at /login with:');
  console.log(`  email: ${EMAIL}`);
  console.log(`  pass:  ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
