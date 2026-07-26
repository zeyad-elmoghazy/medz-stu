import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

/**
 * Redis-backed rate limiters.
 *
 * Each export is `Ratelimit | null`. When the Upstash env vars are
 * missing (local dev / demo bundle), `redis` from ./redis is null
 * and every limiter is null — `applyRateLimit` then treats every
 * request as "not limited" and the app keeps working.
 *
 * The sliding-window algorithm is used everywhere because it has
 * the smoothest distribution (no burst at minute boundaries) and
 * costs the same as fixed-window on Upstash.
 *
 * `analytics: true` reports each .limit() call to the Upstash
 * dashboard so you can spot abuse without instrumenting the app.
 */
function buildLimiter(
  tokens: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
  prefix: string
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix,
  });
}

// Different limits for different endpoints:

// Auth: 5 attempts per 15 minutes per IP
// Strict on purpose — password guessing is exponentially cheaper
// at scale, so this is the "credential stuffing" line of defense.
export const authLimiter = buildLimiter(5, '15 m', 'rl:auth');

// Quiz submission: 30 per hour per user
// (max ~30 questions per hour is reasonable)
// Caps a buggy client or malicious replay; a real student
// finishing the 11-question block uses ~1% of the budget.
export const quizLimiter = buildLimiter(30, '1 h', 'rl:quiz');

// API general: 100 requests per minute per user
// Mostly here as a runaway-loop circuit breaker. A real
// dashboard load makes ~3-5 calls — 100/min has 20-30x headroom.
export const apiLimiter = buildLimiter(100, '1 m', 'rl:api');

// Admin actions: 20 per minute (protect bulk ops)
// Admins are highly trusted but their endpoints are destructive
// (remove user, reset scores). 20/min still allows a click-spree
// in the UI while making scripted abuse loud.
export const adminLimiter = buildLimiter(20, '1 m', 'rl:admin');

// Professor uploads: 10 per hour
// Uploads trigger AI processing — expensive on the server side.
// 10/h covers a normal authoring session without inviting
// pathological batches.
export const uploadLimiter = buildLimiter(10, '1 h', 'rl:upload');
