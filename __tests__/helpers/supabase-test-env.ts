// Shared setup for integration tests that hit the real MedZ-Stu database.
//
// No prior Jest test in this repo touched Supabase (confirmed by grepping
// __tests__/ for SUPABASE|createClient before writing this) — this file
// establishes that convention for the first time, following the pattern
// already used everywhere else in this project (manual smoke tests, the
// RLS adversarial SQL suite): real database, never mocked Supabase
// behavior. Jest doesn't auto-load .env.development.local the way Next.js
// does, so this file does that loading itself.
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSafeSupabaseTestUrl } from './test-env-guard';

function parseEnvFile(filePath: string): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return entries;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function loadEnvFile(filePath: string): void {
  const entries = parseEnvFile(filePath);
  if (Object.keys(entries).length === 0) return;
  // This file holds service-role credentials, and these suites create and
  // delete auth users with them. Never load it when it (or the shell)
  // points the tests at anything but a local Supabase stack, so a plain
  // `npm test` can no longer write to the production project.
  const targetUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? entries.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!isSafeSupabaseTestUrl(targetUrl)) {
    console.warn(
      `[supabase-test-env] ${path.basename(filePath)} points at a non-local Supabase ` +
        'project; not loading it, integration tests will be skipped. Use a local ' +
        'stack (supabase start), or set SUPABASE_TEST_ALLOW_REMOTE=1 for a hosted ' +
        'NON-production test project.',
    );
    return;
  }
  for (const [key, value] of Object.entries(entries)) {
    // Never clobber an env var CI (or the shell) already provided.
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../.env.development.local'));

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Guards every describe block in this suite. Mirrors the existing
 * describeIfPdf pattern in pipeline.integration.test.ts (skip gracefully
 * when a prerequisite is missing) rather than failing hard when a CI
 * environment has no Supabase secrets configured.
 */
export function supabaseTestEnvAvailable(): boolean {
  return (
    Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) &&
    isSafeSupabaseTestUrl(SUPABASE_URL)
  );
}

/** Defence in depth: refuse to build a client for a non-test project. */
function assertSafeTestTarget(): void {
  if (!isSafeSupabaseTestUrl(SUPABASE_URL)) {
    throw new Error(
      'Refusing to run integration tests against a non-local or production Supabase project.',
    );
  }
}

export function getServiceRoleClient(): SupabaseClient {
  assertSafeTestTarget();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getAnonClient(): SupabaseClient {
  assertSafeTestTarget();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let seq = 0;
export function uniqueSlug(label: string): string {
  seq += 1;
  return `medz-test-${label}-${Date.now()}-${seq}`;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Creates a real auth user via the service-role admin API. The
 * on_auth_user_created trigger auto-provisions the matching profiles row,
 * so no separate profiles insert is needed. Since migration 030 that row
 * is always created as a student (signup can't self-assign admin), so an
 * 'admin' user is promoted afterwards through the service role, the one
 * caller the role-protection triggers (013, 031) allow to change `role`.
 */
export async function createTestUser(
  admin: SupabaseClient,
  role: 'student' | 'admin',
): Promise<TestUser> {
  const email = `${uniqueSlug(role)}@example.invalid`;
  const password = `Aa1!${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: `Test ${role}` },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser(${role}) failed: ${error?.message}`);
  }
  if (role === 'admin') {
    const promoted = await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
    if (promoted.error) {
      throw new Error(`createTestUser(admin) promotion failed: ${promoted.error.message}`);
    }
  }
  return { id: data.user.id, email, password };
}

/** Deletes the auth user; cascades to profiles (FK ON DELETE CASCADE). */
export async function deleteTestUser(admin: SupabaseClient, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}

/**
 * Signs in as a test user and returns a client holding that live session
 * — used as the "authenticated" client injected in place of the real
 * createRouteHandlerClient() when calling route handlers directly.
 */
export async function signInTestUser(email: string, password: string): Promise<SupabaseClient> {
  const client = getAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signInTestUser(${email}) failed: ${error?.message}`);
  }
  return client;
}
