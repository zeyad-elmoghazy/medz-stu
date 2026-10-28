# MedZ — Security Handoff

Pick-up notes for the next Claude session or developer. Written 2026-10-28, after the
security audit (`docs/SECURITY_AUDIT_2026-10-23.md`) and its follow-ups. Everything under
"Already done" is live in production and verified; everything under "To fix later" is a
**deliberate deferral by the owner**, not an oversight.

> ⚠️ This repository is **public**. Anything committed here — including this file and the
> audit report — is readable by anyone. Don't put secrets, tokens or real emails in it.

---

## Already done (don't redo)

- Next.js patched to 16.4.x (critical RCE advisories), `sharp`, and `zod` 4.6.7+ (high memory-exhaustion advisory). `npm audit --omit=dev` = 0.
- Migration `038_lock_anonymous_access` applied to prod: the public anon key can only read column-limited `modules`/`chapters` (landing page). Everything else needs a signed-in user.
- Login goes through `/api/auth/login` with per-email (10/15 min) and per-IP (300/15 min) limits. Verified live: the 11th wrong attempt for one email returns 429.
- Upstash Redis (free tier, us-east-1) is connected in Vercel Production (`UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`). All limiters are live. Limiters **fail open** if Redis is down.
- CSP pinned to our own Supabase origin; `unsafe-eval` dev-only; CSRF guard for cross-site writes in `proxy.ts`; demo mode impossible in production; generic DB errors on student routes.
- GitHub: Dependabot alerts + security updates, secret scanning + push protection enabled.
- Vercel env cleaned to the 5 variables the app reads; Supabase dashboard auth settings applied by the owner.
- `public/.well-known/security.txt` points at https://www.medizee.app/ (see item 6 for its limitation).

## To fix later (owner chose to defer)

### 1. Public audit report lists remaining weaknesses — *medium, 10 min*
`docs/SECURITY_AUDIT_2026-10-23.md` is in a public repo and its "Residual risks" and "What I
could not do" sections read as a to-do list for an attacker. The owner chose to keep it for
now. **Fix:** trim those two sections (or delete the file, or move it to a private place).
Note git history keeps the old text either way; this only stops advertising it.

### 2. Registered users can scrape the question bank — *medium, product decision*
Sign-up is open and the quiz API returns `correctAnswer` + explanation to the browser (needed
for instant feedback). Anyone can register and page through ~5,400 questions. Options:
invite-only/paid access; or return answers only after each submit through a rate-limited
route (bigger change to the quiz client). Skipped by the owner for now.

### 3. CAPTCHA on sign-up / sign-in — *low-medium, ~half a day*
**Do NOT just tick CAPTCHA in the Supabase dashboard** — the app never sends a captcha token,
so every login and signup would fail. Proper work: Cloudflare Turnstile (or hCaptcha) widget
on `/login` and `/signup`, pass the token through `/api/auth/login` and `signUp`, then
enable it under Supabase → Auth → Attack Protection. The Turnstile secret is entered in the
Supabase dashboard by the owner. The rate limits already cover most of the risk.

### 4. Sign-up, forgot-password and reset still call Supabase directly — *low*
Only login was moved behind the app's limiter. These three rely on Supabase's built-in auth
rate limits. If abuse appears (e.g. password-reset email bombing), route them through
`/api/auth/*` handlers with the same pattern as `app/api/auth/login/route.ts` (see
`lib/rate-limit.ts`, `lib/apply-rate-limit.ts`, tests in `__tests__/unit/login-route.test.ts`).

### 5. Vercel Deployment Protection is off — *low, 2 min*
Preview URLs are public and use the Preview environment variables. Enable **Standard
Protection** (previews only) under Vercel → Settings → Deployment Protection. Do **not**
choose the option that adds authentication to *production* — it would lock out students.
Skipped by the owner.

### 6. `security.txt` has no real contact — *low*
`Contact:` points at the site homepage, which has no way to report a vulnerability. Create a
mailbox you actually read (e.g. `security@medizee.app`), then set
`Contact: mailto:security@medizee.app` in `public/.well-known/security.txt`. Optionally add a
`/security` page and a `Policy:` line. Renew `Expires:` before 2027-01-01.

### 7. CSP still allows inline scripts — *low, large change*
`script-src 'self' 'unsafe-inline'` remains because a nonce-based CSP forces every page to
render dynamically (loses the static landing page / CDN caching). Revisit only if a real
need appears. No HTML sinks exist today (3 `dangerouslySetInnerHTML` uses, all static).

### 8. Smaller items
- **Demo mode code** still exists (inert in production). Removing it touches ~15 files.
- **Auth cookies are not `httpOnly`** — required by the Supabase browser client.
- **Tailwind 3 build-time advisories** and low-severity `jest` tooling advisories remain in `npm audit`. Dev-only, never shipped.
- **3 failing integration tests** (`require-admin` ×2, `import-route-idempotency` ×1) fail identically on `main`: their helper creates "admin" users via signup metadata, which migration 030 ignores. Fix the helper to promote via service role.
- **Branch protection on `main`** is not enabled (GitHub → Settings → Branches).
- **Dependabot version updates** (not just security updates) need a `.github/dependabot.yml`.
- **Watch the Upstash free quota** (500k commands/month) on the console's Usage tab. At the limit requests are allowed through (fail open), not blocked.

---

## How to verify production quickly

```bash
curl -s https://www.medizee.app/api/health          # expect 200 {"supabase":"ok","redis":"ok"}
curl -sI https://www.medizee.app/api/student/profile | grep -i x-ratelimit   # limiter active
# Login limiter: 11 wrong attempts for ONE fake email -> ten 401s then 429
E="probe-$RANDOM@example.invalid"; for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://www.medizee.app/api/auth/login \
    -H 'content-type: application/json' -d "{\"email\":\"$E\",\"password\":\"x$i\"}"; done
```
Anonymous lockdown: with the public anon key, `GET /rest/v1/questions` must return 401
(`42501 permission denied`); `modules?select=code,name,year_num` must return 200.

## Gotchas that cost time

- **Never paste Upstash/Supabase tokens by hand-selecting text** — a stray character ("→")
  in `UPSTASH_REDIS_TOKEN` made every Redis call throw `Cannot convert argument to a ByteString`
  (visible in Vercel → Logs as `[middleware] rate-limit check failed`). Use the copy icon and
  reveal the value (eye icon) before saving.
- **The Upstash client JSON-decodes replies** (`"1"` reads back as the number `1`).
- **Corporate/campus firewalls** (e.g. Fortinet) may block `medizee.app` as a "newly
  registered domain" and TLS-intercept; `curl` then fails with exit 60. Use another network.
- **Migrations are applied by hand** to production (`apply_migration`); deploy the code
  first, then the migration. `038` is already applied; rollback SQL is at the bottom of it.
- Local end-to-end: `supabase/seed.sql` intentionally does **not** grant anon table access
  (mirrors 038). SQL tests live in `supabase/tests/` (`038_anon_lockdown.sql` has 40 checks).
- The Vercel MCP connector may not see this project (different account); the Browser pane
  works if the owner is signed in. Agents must not type passwords/tokens into any form.
