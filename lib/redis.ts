import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_URL;
const token = process.env.UPSTASH_REDIS_TOKEN;

/**
 * Upstash Redis client.
 *
 * In production both env vars must be set (see .env.local.example).
 * If either is missing — local dev, CI without credentials, the
 * demo bundle — we export `null` and `lib/cache.ts` treats every
 * call as a cache miss. The app keeps working, just slower; no
 * route handler is ever blocked by a missing Upstash account.
 */
export const redis = url && token ? new Redis({ url, token }) : null;

// Cache key patterns — centralize all keys here
// so you never have typos across files.
// Pattern: <namespace>:<owner-or-resource-id>. Keep them stable;
// changing a key shape invalidates every cached entry under it.
export const CACHE_KEYS = {
  studentProfile: (uid: string) => `profile:${uid}`,
  studentAnalytics: (uid: string) => `analytics:${uid}`,
  subjectList: () => `subjects:all`,
  questionBank: (subjectId: string) => `questions:${subjectId}`,
  leaderboard: (subjectId: string) => `leaderboard:${subjectId}`,
};

// TTL constants in seconds.
// Every value is a deliberate trade between freshness and load —
// the rationale matters more than the number.
export const TTL = {
  // PROFILE — 5 min.
  // The profile row only mutates on signup, role promotion, or an
  // explicit edit. Five minutes is short enough that a role change
  // (e.g. promote-to-admin) propagates faster than support tickets
  // can be filed, and long enough to absorb the "every page load
  // calls getProfile()" pattern on a per-student session.
  PROFILE: 300,

  // ANALYTICS — 1 hour.
  // Reads from the `student_analytics` materialized view, which
  // pg_cron already refreshes hourly. Matching the cache TTL to the
  // view's refresh cadence means dashboard loads do at most one
  // Postgres round-trip per student per hour — collapsing N
  // concurrent dashboard opens into a single read. Explicitly
  // invalidated on quiz submit so the user always sees their own
  // latest score even within the hour.
  ANALYTICS: 3600,

  // SUBJECTS — 24 hours.
  // Catalog mutates a few times per semester (admin adds a block,
  // toggles a subject live). 24h is the longest interval an admin
  // would tolerate before the platform "feels stuck"; in practice
  // we also invalidate on every subject mutation, so the TTL is
  // mostly a safety net.
  SUBJECTS: 86400,

  // QUESTIONS — 24 hours.
  // Question banks are versioned content: once Dr. Zahra publishes
  // a block, the 11 questions don't mutate. 24h means hundreds of
  // student quiz starts share a single Postgres read of the bank;
  // we also invalidate on publish, so most entries live the full
  // day from cold start.
  QUESTIONS: 86400,

  // LEADERBOARD — 5 minutes.
  // Has to feel "live" to motivate, but recomputing on every page
  // view burns the materialized rank query repeatedly. Five
  // minutes is the sweet spot — leaderboards move visibly between
  // visits without becoming a per-pageview Postgres workload.
  LEADERBOARD: 300,
};
