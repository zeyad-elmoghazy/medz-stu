// Pure guard (no side effects on import) deciding whether an integration
// test may talk to a given Supabase URL. The integration suites use the
// service-role key to create and delete auth users and write rows, so
// they must never run against the production project.

// Project refs that are never an acceptable test target.
const PRODUCTION_PROJECT_REFS = ['usiuoyvrphitqsyxwoty'];

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Local stack: always allowed. Hosted project: only with an explicit
 * opt-in (SUPABASE_TEST_ALLOW_REMOTE=1) and never the production ref.
 */
export function isSafeSupabaseTestUrl(
  url: string,
  allowRemote: boolean = process.env.SUPABASE_TEST_ALLOW_REMOTE === '1',
): boolean {
  if (!url) return false;
  if (PRODUCTION_PROJECT_REFS.some((ref) => url.includes(ref))) return false;
  return isLocalSupabaseUrl(url) || allowRemote;
}
