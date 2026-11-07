/**
 * "Did you mean gmail.com?" for the signup form.
 *
 * Built from the domains real students signed up with: 38% of addresses on
 * a mistyped domain (gmail.con, badya.uni.eg, students.kasralainy, ...) never
 * confirmed, because the confirmation email went nowhere. The hint is
 * advisory only, never blocking, so it errs toward staying quiet.
 */

const PUBLIC_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'outlook.com'];

// University domains seen in signup data, keyed by a label that identifies them.
const UNIVERSITY_DOMAINS: { match: (label: string) => boolean; domain: string }[] = [
  { match: (l) => l.includes('kasralainy'), domain: 'students.kasralainy.edu.eg' },
  { match: (l) => l.startsWith('badya'), domain: 'badyauni.edu.eg' },
  { match: (l) => l === 'gcu', domain: 'my.gcu.edu' },
];

const KNOWN = new Set([...PUBLIC_DOMAINS, ...UNIVERSITY_DOMAINS.map((u) => u.domain)]);

// Real providers that sit one edit away from a public one (mail.com ~ gmail.com).
const LEGIT_LOOKALIKES = new Set(['mail.com', 'live.com', 'msn.com', 'aol.com', 'ymail.com', 'me.com']);

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** The domain the student probably meant, or null when the address looks fine. */
export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  if (domain.length < 3 || KNOWN.has(domain) || LEGIT_LOOKALIKES.has(domain)) return null;

  const labels = domain.split('.');
  for (const uni of UNIVERSITY_DOMAINS) {
    if (labels.some(uni.match)) return uni.domain;
  }

  // "gmail" or "gmail.c": a truncated public domain.
  const truncated = PUBLIC_DOMAINS.find((d) => d.startsWith(domain));
  if (truncated) return truncated;

  const close = PUBLIC_DOMAINS.find((d) => editDistance(domain, d) <= 2);
  return close ?? null;
}

/** The address with its domain replaced by the suggestion. */
export function applyDomainSuggestion(email: string, domain: string): string {
  return `${email.slice(0, email.lastIndexOf('@'))}@${domain}`;
}
