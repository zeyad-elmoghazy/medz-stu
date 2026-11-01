/**
 * Turn an attacker-controllable `next` query value into a same-origin
 * relative target (path + query + hash), or '/' when it is anything else.
 *
 * Checking only the first two characters is not enough: the WHATWG URL
 * parser deletes tab / LF / CR from its input and treats `\` like `/`, so
 * "/<TAB>/evil.example" starts with a single "/" yet resolves to
 * "//evil.example", an off-site redirect. Reject control characters and
 * backslashes outright, then require the resolved URL to keep our origin.
 */
export function safeRelativeNext(
  raw: string | null | undefined,
  origin: string,
): string {
  if (!raw || !raw.startsWith('/')) return '/';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    // C0 controls (includes tab/LF/CR), DEL, and backslash.
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return '/';
  }
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return '/';
    const target = `${url.pathname}${url.search}${url.hash}`;
    // Dot-segment removal can leave a path that starts with "//"
    // ("/..//evil.example" -> "//evil.example"), which the caller would
    // resolve as a scheme-relative, off-site URL.
    return target.startsWith('//') ? '/' : target;
  } catch {
    return '/';
  }
}
