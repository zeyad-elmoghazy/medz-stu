import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  SUPABASE_URL,
  supabaseTestEnvAvailable,
} from '../helpers/supabase-test-env';

// ponytail: GoTrue forces raw_app_meta_data.provider to 'email' for users made
// through the admin API, so the Google cases below insert into auth.users with
// psql instead (each inside a transaction that is rolled back). Add a pg
// dependency only if more tests need SQL.
const hasPsql = spawnSync('psql', ['--version']).status === 0;
const describeIfReady = supabaseTestEnvAvailable() && hasPsql ? describe : describe.skip;

// supabase CLI convention: the DB port is the API port + 1.
const apiPort = Number(new URL(SUPABASE_URL || 'http://127.0.0.1:54321').port);
const DB_URL =
  process.env.SUPABASE_TEST_DB_URL ??
  `postgresql://postgres:postgres@127.0.0.1:${apiPort + 1}/postgres`;

function sql(statements: string): string {
  return execFileSync('psql', [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN; ${statements} ROLLBACK;`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function signup(provider: string, meta: Record<string, unknown>) {
  const id = randomUUID();
  const insert =
    `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES ` +
    `('${id}', 'oauth-${id}@example.invalid', '${JSON.stringify({ provider })}', '${JSON.stringify(meta).replace(/'/g, "''")}');`;
  const read =
    `SELECT row_to_json(p) FROM (SELECT role, username, academic_year, full_name, signup_source ` +
    `FROM public.profiles WHERE id = '${id}') p;`;
  return sql(`${insert} ${read}`);
}

/**
 * Migration 044: a non-email provider (Google) may create a profile without a
 * username; the email path stays strict.
 */
describeIfReady('OAuth profile completion (migration 044)', () => {
  it('creates a username-less, year-less student profile for a Google signup', () => {
    const out = signup('google', { name: 'Google Student' });
    expect(JSON.parse(out.split('\n').find((l) => l.startsWith('{'))!)).toEqual({
      role: 'student',
      username: null,
      academic_year: null,
      full_name: 'Google Student',
      signup_source: null,
    });
  });

  it('still requires a username for an email signup', () => {
    expect(() => signup('email', { name: 'No Username' })).toThrow(/username_required/);
  });

  it('treats a missing provider as an email signup', () => {
    const id = randomUUID();
    expect(() =>
      sql(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id}', 'x-${id}@example.invalid', '{}');`,
      ),
    ).toThrow(/username_required/);
  });

  it('still validates a username that a Google signup does supply', () => {
    expect(() => signup('google', { username: 'admin' })).toThrow(/username_reserved/);
    expect(() => signup('google', { username: 'Bad Name!' })).toThrow(/username_invalid/);

    const out = signup('google', { username: 'go_student1', signup_source: 'friend' });
    expect(out).toContain('"username":"go_student1"');
    expect(out).toContain('"signup_source":"friend"');
  });
});
