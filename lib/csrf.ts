const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * True when a state-changing request was initiated by a different site.
 *
 * Auth cookies are SameSite=Lax, which already blocks most cross-site
 * writes; this is the second layer. Browsers always send Sec-Fetch-Site
 * (page JS can't forge it) and Origin on cross-origin writes. Requests
 * carrying neither header are non-browser clients (curl, server-to-
 * server) — they have no ambient cookies to ride, so they pass.
 */
export function isCrossSiteWrite(method: string, headers: Headers): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;

  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite !== 'same-origin' && fetchSite !== 'none';

  const origin = headers.get('origin');
  if (!origin) return false;

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // malformed Origin on a write → reject
  }
}
