import { redis } from './redis';

/**
 * Read-through cache wrapper.
 *
 * Pattern:
 *   1. Try Redis first.
 *   2. On miss, call the fetcher (your Postgres query).
 *   3. Fire-and-forget the cache write so the user response
 *      doesn't wait on Redis.
 *
 * Failure modes are absorbed silently — if Redis is misconfigured
 * or unreachable, every call degrades to the fetcher path. We log
 * the error so it shows up in observability but never propagate
 * it to the caller; data freshness is a better default than 500.
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // No Upstash credentials configured — bypass the cache entirely
  // and hit the source of truth. Lets local dev / the demo bundle
  // run without an Upstash account.
  if (!redis) {
    return fetcher();
  }

  // Try cache first.
  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch (err) {
    // A Redis read failure shouldn't take down the request;
    // fall through to the source of truth.
    console.error(`[cache] read failed for ${key}:`, err);
  }

  // Cache miss: fetch from DB.
  const fresh = await fetcher();

  // Store in cache (don't await — fire and forget).
  // Stringify even though the Upstash SDK can auto-serialize:
  // explicit JSON is portable across SDK versions and makes the
  // payload trivially auditable in the Upstash dashboard.
  redis
    .setex(key, ttl, JSON.stringify(fresh))
    .catch((err) => console.error(`[cache] write failed for ${key}:`, err));

  return fresh;
}

/**
 * Invalidate one or more cache entries.
 *
 * Call this after any mutation that would make a cached read stale
 * — quiz submit, profile edit, subject publish, etc. Variadic so
 * callers can list every affected key in one DEL round trip.
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    // Logged but not thrown: a stale cache entry is better than a
    // failed mutation. The TTL will eventually clear it anyway.
    console.error(`[cache] invalidate failed for [${keys.join(', ')}]:`, err);
  }
}
