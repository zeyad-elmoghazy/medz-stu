/**
 * Where a signup came from: a one-tap "How did you hear about MediZee?"
 * answer plus the utm_* params of the landing URL.
 *
 * Both reach the database as auth user metadata, where handle_new_auth_user
 * (migration 043) re-validates them, so nothing here is trusted. Email
 * signups pass them through signUp({ data }); Google signups can't (the OAuth
 * redirect carries no metadata), so they ride in cookies that
 * app/auth/callback/route.ts reads once the session exists.
 */

export const SIGNUP_SOURCES = ['instagram', 'tiktok', 'friend', 'class_group', 'other'] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

export const SIGNUP_SOURCE_LABELS: Record<SignupSource, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  friend: 'Friend',
  class_group: 'Class group',
  other: 'Other',
};

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** First-touch UTM cookie, set by proxy.ts on the first page that carries utm_*. */
export const UTM_COOKIE = 'mz_utm';
/** The chosen source, held across the Google round trip. */
export const SOURCE_COOKIE = 'mz_signup_source';
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const SOURCE_COOKIE_MAX_AGE = 60 * 30; // long enough for the Google consent screen

const UTM_VALUE_MAX = 100;

export function isSignupSource(value: unknown): value is SignupSource {
  return typeof value === 'string' && (SIGNUP_SOURCES as readonly string[]).includes(value);
}

/** Only the five utm_* keys, each a non-empty string cut to 100 chars. */
export function sanitizeUtm(input: unknown): Utm {
  const out: Utm = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of UTM_KEYS) {
    // Own properties only: an inherited value is never user input.
    if (!Object.hasOwn(input, key)) continue;
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, UTM_VALUE_MAX);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

export function utmFromSearchParams(params: URLSearchParams): Utm {
  return sanitizeUtm(Object.fromEntries(UTM_KEYS.map((k) => [k, params.get(k)])));
}

/**
 * Reads the cookie back. The server hands over the decoded JSON
 * (request.cookies), the browser's document.cookie the URL-encoded form;
 * accept both. Anything malformed is empty.
 */
export function parseUtmCookie(raw: string | null | undefined): Utm {
  if (!raw) return {};
  for (const attempt of [() => raw, () => decodeURIComponent(raw)]) {
    try {
      return sanitizeUtm(JSON.parse(attempt()));
    } catch {
      /* try the next form */
    }
  }
  return {};
}

/** Raw JSON: NextResponse.cookies and the browser URL-encode it themselves. */
export function serializeUtmCookie(utm: Utm): string {
  return JSON.stringify(sanitizeUtm(utm));
}

/** document.cookie lookup for the signup page. */
export function readCookie(name: string, cookieString: string): string | null {
  for (const part of cookieString.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
