// Server-side environment validation. Imported once from a server-only
// entrypoint (e.g. a top-level `import '@/lib/env-validation'` in
// instrumentation.ts or the first server component) to fail fast if
// production env is misconfigured — misspelled var, missing key, or
// (worst case) the service_role secret leaked into a NEXT_PUBLIC_ var.
//
// Client bundles must never see this module. The window guard below
// throws loudly if a route accidentally pulls it in.
import { z } from 'zod';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/env-validation.ts imported client-side — service key would be exposed. Move the import to a server-only file.',
  );
}

// Placeholder values used by the demo bundle. Recognised so validation
// stays useful in dev without forcing every contributor to hold real
// Supabase credentials.
const PLACEHOLDER_MARKERS = ['demo', 'placeholder', 'your-', 'example'];

const isPlaceholder = (v: string) =>
  PLACEHOLDER_MARKERS.some((m) => v.toLowerCase().includes(m));

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(40, 'SUPABASE_SERVICE_ROLE_KEY looks too short — expected a JWT')
    .optional(),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
  IP_SALT: z.string().min(16).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

const serverParsed = serverSchema.safeParse(process.env);
const publicParsed = publicSchema.safeParse(process.env);

if (!serverParsed.success) {
  // Show the fields that failed but never the values (they may be secrets).
  const issues = serverParsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid server env: ${issues}`);
}
if (!publicParsed.success) {
  const issues = publicParsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid public env: ${issues}`);
}

export const serverEnv: ServerEnv = serverParsed.data;
export const publicEnv: PublicEnv = publicParsed.data;

// Guardrail: if the real service-role key is set, make sure no
// NEXT_PUBLIC_* var accidentally embeds a prefix of it. A single
// misplaced copy-paste is the fastest known way to leak the key.
const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
if (
  serviceKey &&
  !isPlaceholder(serviceKey) &&
  serviceKey.length >= 40 &&
  serverEnv.NODE_ENV === 'production'
) {
  const marker = serviceKey.slice(0, 24);
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (typeof value === 'string' && value.includes(marker)) {
      throw new Error(
        `SECURITY: service_role key material appears inside ${key}. Rotate the key and remove it from NEXT_PUBLIC_* env.`,
      );
    }
  }
}

// Runtime helper: production expects Upstash creds so the rate limiter
// is Redis-backed rather than in-memory. Warn (not throw) — the app
// still works in demo mode.
if (
  serverEnv.NODE_ENV === 'production' &&
  (!serverEnv.UPSTASH_REDIS_URL || !serverEnv.UPSTASH_REDIS_TOKEN)
) {
  // eslint-disable-next-line no-console
  console.warn('[env] Production without Upstash — rate limiter is a no-op.');
}
