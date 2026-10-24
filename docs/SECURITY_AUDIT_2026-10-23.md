# MedZ security audit — 2026-10-23

Branch: `security/hardening` (not merged). Scope: the Next.js app, its API routes, the
Supabase production database (read-only inspection), dependencies, git history, and
deployment hygiene.

## Verdict

The app was already in better shape than most: every admin route goes through one shared
`requireAdmin()` gate, every student route authenticates with `getUser()` and is scoped by
RLS, every public table has RLS, privilege escalation is blocked by DB triggers, and no
secret has ever been committed. The real problems were **an unpatched critical Next.js
RCE**, **an anonymous dump of the whole question bank**, a **login rate limiter that never
ran**, and a handful of hardening gaps.

## Fixed on this branch

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **Critical** | Lockfile pinned `next 16.3.1` — several unauthenticated RCE advisories (image-optimization API with AVIF/SVG, `use cache`, `next/og`) and cache-poisoning/SSRF. The app enables AVIF. | `next` → 16.4.3, `sharp` → 0.35.5, plus `npm audit fix` (handlebars, js-yaml, brace-expansion). Version floors raised in `package.json` so a fresh resolve can't pick a vulnerable one. |
| 2 | **High** | Anyone with the public anon key could `GET /rest/v1/questions` and dump all 5,447 published questions with answers/explanations, plus `reference_pages`, `reference_books`, `subjects`, `badges` — **no account needed**. anon also held INSERT/UPDATE/DELETE/TRUNCATE on every table (TRUNCATE bypasses RLS). | Migration `038_lock_anonymous_access.sql`: anon loses all table privileges except column-limited SELECT on `modules`/`chapters` (the landing page); read policies → `authenticated`; new tables no longer auto-grant anon; authenticated loses TRUNCATE/TRIGGER/REFERENCES. Landing page's question total now comes from `chapters.published_count` (5447 = 5447). |
| 3 | **High** | The login page called Supabase directly from the browser, so the server-side login rate limiter (`/api/auth/login`) was dead code — no app-level brute-force protection. The limiter itself (5 / 15 min / IP) would have locked out a lecture hall behind one campus NAT. | Login now goes through `/api/auth/login`. Limits: **10 / 15 min per email** (hashed key, stops targeted guessing) + **300 / 15 min per IP** (stops credential stuffing). 429 shows a friendly "try again in N minutes". Limiter **fails open** if Redis is down. |
| 4 | Medium | `isDemoMode()` was driven by `NEXT_PUBLIC_DEMO`, inlined into the client bundle: one stray `=1` in the host env would disable the page auth gate in production. | Hard-disabled when `NODE_ENV === 'production'`. |
| 5 | Medium | CSP allowed `'unsafe-eval'` in production, any `https:` image, any `*.supabase.co` tenant (exfil target), `*.upstash.io`; `next/image` would proxy any Supabase tenant. | `unsafe-eval` dev-only; `img-src`/`connect-src`/`remotePatterns` pinned to **your** Supabase origin; added `object-src 'none'`, `upgrade-insecure-requests`, `Cross-Origin-Opener-Policy`; removed unused Upstash and `cdn.medz.app` entries. |
| 6 | Medium | 30 student routes returned raw Postgres/PostgREST `error.message` (table/column/constraint names). | `publicDbError()` logs server-side, returns a generic message. (Admin routes and the password route intentionally unchanged.) |
| 7 | Medium | No CSRF layer beyond SameSite=Lax. | `proxy.ts` rejects cross-site state-changing `/api` requests (`Sec-Fetch-Site`, `Origin` fallback). Non-browser clients unaffected. |
| 8 | Low | Notes had no length limit; admin upload trusted client MIME/filename and ignored its `uploadLimiter`. | Notes capped at 10,000 chars (server + textarea); upload checks the `%PDF-` magic bytes and is rate-limited. |
| 9 | Low | Proxy trusted `getSession()` (unverified cookie). Not exploitable — the later role lookup failed closed on a forged token (proven by replaying a forged cookie against the old proxy) — but fragile. | `getClaims()` verifies the JWT signature locally (ES256 JWKS) before anything else. Defence in depth. |
| 10 | Low | Exposed/unneeded files: `public/test-data/*.pdf` served to the internet; retired DigitalOcean/nginx scripts; dead professor files; dead `lib/env-validation.ts`; stale `.env.local.example` (QStash, etc.). | Removed / moved to `__tests__/fixtures/`; `.env.local.example` now lists exactly the 6 variables the app reads. |

## Checked and fine (no change needed)

- **Git history (143 commits, all branches):** no JWTs, `sb_secret_`, Resend/AWS/GitHub/Slack tokens, private keys or `.env` files. The only credential-shaped matches are placeholders (`${DB_PRIVATE_IP}`, `your-supabase-service-role-key`). **No key rotation required.**
- **Secrets in the bundle:** only the two `NEXT_PUBLIC_SUPABASE_*` values (public by design). The service-role key is read server-side only; `lib/supabase-service.ts` is `server-only`.
- **Admin protection:** every `/api/admin/*` route calls `requireAdmin()` (fresh role lookup each request); `/admin` also re-checks in its layout. Remove-user guards: not yourself, students only, UUID-validated.
- **Privilege escalation:** `protect_profile_columns` (allow-list) and `prevent_role_elevation` triggers; `record_quiz_result`, leaderboard and rank RPCs are service-role only. Direct PostgREST attempts to set `role`/`total_xp`, write other users' rows, call XP RPCs, or edit/delete questions all fail (tested).
- **Passwords:** hashed by Supabase Auth (bcrypt); the app never sees or stores them. Change-password re-verifies the current password and is rate-limited.
- **XSS:** React escapes everything; the only 3 `dangerouslySetInnerHTML` uses are static strings. `/auth/confirm` validates its `next` redirect.
- **CORS:** no CORS headers anywhere → same-origin only. Correct.
- **Debug:** no debug flags; `console.*` stripped in prod builds; source maps off; `X-Powered-By` off.
- **Storage:** the only bucket (`notes-pages`) is private; textbook pages are served via 15-minute signed URLs after an access check.
- **Supabase advisor:** 0 warnings (8 INFO items are your own `audit_backup` snapshot tables).

## What I could not do — needs you

1. **Apply migration 038 to production — AFTER the code is deployed.** The landing page change must be live first, otherwise the old landing page's question count query is refused between the migration and the deploy. Rollback script is at the bottom of the migration. Re-run the advisor afterwards.
2. **Vercel → Settings → Environment Variables (Production):** confirm `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` are set — without them **every rate limiter silently does nothing** — and that `NEXT_PUBLIC_DEMO` is not set. (The Vercel connector couldn't read the project, so I couldn't check.)
3. **Supabase Dashboard → Authentication:** turn on *Leaked password protection*; consider *Attack Protection / CAPTCHA* on sign-up and sign-in; confirm *Confirm email* is on and the minimum password length is ≥ 8 (the client enforces 8; the server setting is what matters).
4. **GitHub:** enable Dependabot alerts + secret scanning/push protection; protect `main`.
5. **`public/.well-known/security.txt`** still points at `security@medz.app` / `https://medz.app/security` — confirm you own that mailbox/domain (your primary domain is `www.medizee.app`).
6. A separate session prepared `chore/supabase-js-2.117.2`. Whichever of the two branches merges second will need `npm install` to re-resolve `package-lock.json`.

## Residual risks (decisions, not bugs)

- **Question scraping by registered users.** Sign-up is open, and the quiz API sends `correctAnswer` + explanation to the browser for instant feedback. Anyone can register and page through the bank. Real mitigation is a product decision: invite/paid access, or revealing answers only after each submit through a rate-limited route.
- **CSP still has `'unsafe-inline'` for scripts.** A nonce-based CSP forces every page to render dynamically (no static landing page / CDN caching). Left as a deliberate trade-off; React's escaping + no HTML sinks keep the practical risk low.
- **Auth cookies are not `httpOnly`** — required by the Supabase browser client. XSS would be the route to session theft, hence the CSP work above.
- **Forgot-password / sign-up still call Supabase directly** (Supabase's own rate limits apply). Same pattern as login if you want app-level limits.
- **Demo mode code still exists** (now inert in production). Deleting it is a bigger refactor across ~15 files.
- **3 moderate `npm audit` items** remain (Tailwind v3's PostCSS chain, build-time only). Fix = Tailwind 4 major upgrade.
- **Pre-existing test failures:** `require-admin` (2) and `import-route-idempotency` (1) fail identically on `main` — their helper creates "admin" users through signup metadata, which migration 030 ignores.

## How this was tested

- Production build (`next build` + `next start`, Next 16.4.3) against a throwaway local Supabase with all 38 migrations + seed.
- `supabase/tests/038_anon_lockdown.sql` (40 checks) and the updated `034` test (33 checks) — and the 038 test was shown to **fail** against pre-038 privileges.
- Real-browser run: landing page (logged out), signup → email confirm → login via the new route → dashboard → quiz submit (4/6, +40 XP), notes/bookmarks/stats/leaderboard, wrong-password path.
- 38-check attack battery over HTTP: cross-site writes, forged session cookie (before/after), student→admin pages and APIs, direct PostgREST escalation/IDOR/XP-cheat/delete attempts, non-PDF upload.
- 21 new unit tests (CSRF helper, demo-mode kill switch, DB-error redaction, the real login handler with per-email/per-IP limiting incl. fail-open), mutation-checked.
- **Not exercised locally:** Upstash Redis itself (none available) — the limiter *wiring* is tested with an in-memory limiter. After deploy, hit `/api/auth/login` 11 times with one email and expect a 429 on the 11th.
