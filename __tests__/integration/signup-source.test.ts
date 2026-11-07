import type { SupabaseClient } from '@supabase/supabase-js';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  signInTestUser,
  deleteTestUser,
  uniqueSlug,
} from '../helpers/supabase-test-env';

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * Migration 043: handle_new_auth_user copies signup_source / signup_utm from
 * the signup metadata, re-validating both, and never fails a signup over them.
 */
describeIfSupabase('signup source + utm (migration 043)', () => {
  let admin: SupabaseClient;
  const created: string[] = [];

  beforeAll(() => {
    admin = getServiceRoleClient();
  });

  afterAll(async () => {
    for (const id of created) await deleteTestUser(admin, id);
  });

  async function signup(meta: Record<string, unknown>) {
    const email = `${uniqueSlug('src')}@example.invalid`;
    const password = `Aa1!${Math.random().toString(36).slice(2)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Source Test',
        username: `tu_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`,
        ...meta,
      },
    });
    if (error || !data.user) throw new Error(`signup failed: ${error?.message}`);
    created.push(data.user.id);
    const { data: profile, error: readError } = await admin
      .from('profiles')
      .select('signup_source, signup_utm')
      .eq('id', data.user.id)
      .single();
    if (readError) throw new Error(readError.message);
    return { id: data.user.id, email, password, profile };
  }

  it('stores a known source and only the utm_* keys, cut to 100 chars', async () => {
    const { profile } = await signup({
      signup_source: 'TikTok ',
      signup_utm: {
        utm_source: 'tiktok',
        utm_campaign: 'c'.repeat(250),
        utm_medium: '   ',
        role: 'admin',
        anything_else: 'x',
      },
    });
    expect(profile.signup_source).toBe('tiktok');
    expect(profile.signup_utm).toEqual({ utm_source: 'tiktok', utm_campaign: 'c'.repeat(100) });
  });

  it('stores NULL, without failing the signup, for unknown or malformed values', async () => {
    const unknown = await signup({ signup_source: 'carrier-pigeon', signup_utm: 'not-an-object' });
    expect(unknown.profile).toEqual({ signup_source: null, signup_utm: null });

    const noneSent = await signup({});
    expect(noneSent.profile).toEqual({ signup_source: null, signup_utm: null });

    const junkOnly = await signup({ signup_utm: { foo: 'bar', utm_term: '' } });
    expect(junkOnly.profile.signup_utm).toBeNull();
  });

  it('is not writable by the student through the API', async () => {
    const { email, password, id } = await signup({ signup_source: 'friend' });
    const asStudent = await signInTestUser(email, password);

    const res = await asStudent.from('profiles').update({ signup_source: 'instagram' }).eq('id', id);
    expect(res.error).not.toBeNull();

    const { data } = await admin.from('profiles').select('signup_source').eq('id', id).single();
    expect(data?.signup_source).toBe('friend');
  });
});
