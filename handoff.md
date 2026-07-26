# MedZ — Session Handoff

Pick-up notes for the next Claude (or developer) session. Read top-to-bottom; don't skip the "Things that will trip you up" section.

---

## 0 · What this is

MedZ is a dark-themed Next.js 14 (App Router) demo for an adaptive medical question bank with three role surfaces (student, professor, admin). Built around Dr. Ahmed Zahra's 11-question Histology MCQ block as the live content; everything else is "Coming Soon" placeholders. Stack: Next 14.2.35, React 18, Tailwind, Framer Motion, Zustand (persist), Recharts, Supabase (auth + Postgres), Upstash Redis + QStash + Ratelimit, Zod.

Repo: <https://github.com/zeyad-elmoghazy/MedZ-demo>
Local path: `/Users/zeezo/Desktop/MedZ/medz-demo`

---

## 1 · Run it locally (the fast path)

```bash
cd /Users/zeezo/Desktop/MedZ/medz-demo
npm install
npm run dev               # → http://localhost:3000
```

`.env.local` already exists with the demo Supabase URL `https://demo.supabase.co` — that triggers `isDemoMode()` everywhere and the app self-serves without any real backend. **Do not check `.env.local` into git** — it's gitignored.

To exit demo mode, replace those env vars with real ones (see `.env.local.example`).

---

## 2 · The route map (memorize this)

URLs map to files via App Router groups. The `(student)`, `(professor)`, `(admin)`, `(auth)` folders are layout groups and don't appear in URLs. **Inside `(student)` there's an extra `student/` segment** so URLs become `/student/...` — that's intentional, it matches the middleware's `/student/*` protection prefix.

| URL | File |
|---|---|
| `/` | `app/page.tsx` (landing) |
| `/login` | `app/(auth)/login/page.tsx` |
| `/signup` | `app/(auth)/signup/page.tsx` |
| `/student/dashboard` | `app/(student)/student/dashboard/page.tsx` |
| `/student/subjects` | `app/(student)/student/subjects/page.tsx` |
| `/student/quiz/[subjectId]` | `app/(student)/student/quiz/[subjectId]/page.tsx` |
| `/student/results/histology` | `app/(student)/student/results/histology/page.tsx` |
| `/student/analytics` | `app/(student)/student/analytics/page.tsx` |
| `/professor/dashboard` | `app/(professor)/professor/dashboard/page.tsx` |
| `/admin/dashboard` | `app/(admin)/admin/dashboard/page.tsx` |

API routes are at their literal paths under `app/api/`:
- `POST /api/auth/login` — server-side login (rate-limited, generic error)
- `GET /api/student/stats` — full StudentStats payload
- `POST /api/student/streak/update` — login-ping
- `POST /api/student/streak/complete` — increment today's count
- `POST /api/quiz/submit` — Zod-validated, scored server-side, writes to `quiz_sessions` + bumps `daily_streaks`
- `GET /api/questions/[subjectId]` — gated, cached
- `GET /api/professor/students` — service-role roster fetch
- `POST /api/professor/upload` — enqueues a QStash job, writes a `jobs` row
- `POST /api/jobs/generate-questions` — QStash worker (signature-verified)
- `GET /api/jobs/status/[jobId]` — poll endpoint
- `POST /api/admin/remove-user`

---

## 3 · Demo mode (this is load-bearing)

`isDemoMode()` in `lib/supabase.ts` returns true when `NEXT_PUBLIC_SUPABASE_URL` is missing, non-https, or contains `demo`/`placeholder`/`example`/`your-supabase`. When true:

1. **`middleware.ts`** early-returns `NextResponse.next()` — does NOT redirect protected routes to `/login`. The page-level logic handles auth via `localStorage`.
2. **`lib/supabase.ts`** exposes `readDemoProfile()` / `writeDemoProfile()` / `clearDemoProfile()` against the `medz-demo-profile` localStorage key.
3. **Login** (`app/(auth)/login/page.tsx`) infers role from the email prefix: `prof@…` → professor, `admin@…` → admin, default → student.
4. **Signup** uses the role from the form (Student or Professor only; admin is hard-excluded).
5. **Dashboards** read the profile from localStorage instead of querying Supabase.
6. **Quiz submission** computes the score client-side and routes to `/student/results/histology?score=X&total=Y` (skipping `/api/quiz/submit` entirely).
7. **Professor dashboard** uses `getMockProfessorStudents()` from `lib/professor-types.ts`.
8. **Cache + queue + rate-limit clients** all degrade gracefully — `lib/redis.ts`, `lib/queue.ts`, and `lib/rate-limit.ts` all export `null` when env vars are missing; the consuming code handles null.

---

## 4 · Architecture decisions worth knowing

### Zustand store (`lib/store.ts`)
The whole quiz state lives in one persisted store. Important fields:
- `currentQuestionIndex`, `answers`, `bookmarks`, `notes`, `quizMode`, `sessionComplete`
- `sessionStartedAt` / `sessionEndedAt` (number timestamps, used for "time taken" on results page)
- `filterQuestionIds` — when set, the quiz page only iterates those IDs. Used by "Quiz on Mistakes".
- `lastResult` — full `SubmissionResult` from `/api/quiz/submit`, read by the results page.
- `savedSession` — `SavedSession | null` for the exit-and-resume flow. Also persisted to `localStorage['medz_quiz_session']` (24h TTL).

Key actions:
- `startSession()` — fresh attempt: timestamp + clear answers + index 0.
- `startMistakeSession(ids)` — clears wrong answers + filters to those IDs + fresh timer.
- `saveSession(subjectId)` / `loadSession(subjectId)` / `clearSession()` — exit/resume flow.
- `setLastResult(result)` — used by submit flow.

Everything is persisted via the `partialize` config; reloading mid-quiz resumes seamlessly.

### Demo profile + auth helpers
- The `@supabase/auth-helpers-nextjs@0.8.7` typed client does NOT propagate the `Database` generic into `.from()` / `.rpc()` chains. The whole chain collapses to `never`. Every server route that touches a table uses an explicit cast pattern — search for `as { role: UserRole } | null` or `as unknown as { from: ... }` and you'll find them. Don't try to "clean up" these casts; they're load-bearing until the auth-helpers package is upgraded or replaced with `@supabase/ssr`.

### The professor name "AZ"
The Histology block belongs to **Dr. Ahmed Zahra** (`SUBJECTS_CONFIG[0].instructor`). His photo lives at `public/dr-zahra.jpg`. The subjects page hero (`components/subjects/HeroSection.tsx`) uses `next/image` for it, wrapped in an 8-layer holographic frame with mouse-tracking 3D tilt (perspective container + float wrapper + tilt wrapper — three nested elements so the float animation and the tilt rotation compose without overwriting each other).

### Subjects-page CSS tokens
`app/globals.css` has two distinct shimmer animations:
- `shimmer` — defined in `tailwind.config.js`, used by the marketing landing page.
- `skeleton-shimmer` — defined in `globals.css`, used by loading skeletons.
- `subjects-shimmer` — defined in `globals.css`, used by the Histology gradient headline.

If you add a fourth, pick a unique name — collisions silently steal each other's keyframes.

### Quiz engine
`app/(student)/student/quiz/[subjectId]/page.tsx` is the biggest file in the project. It contains:
- Phase 1 fullscreen MCQ
- Phase 2 split-view (left feedback + right tabs: Explanation / handwritten Reference)
- Three nested AnimatePresence panels: NotesPanel (dynamic-imported), AITutor (dynamic-imported), ExitModal, ViolationWarning, in-page error banner
- Fullscreen API w/ a `userExitRef` vs `intentionalExitRef` vs unintentional-exit logic
- 3-strike anti-cheat counter that force-ends the session

When editing it: keep state declarations BEFORE any `useEffect` that references them (we hit a TDZ crash from this exact mistake during the build).

### Code-splitting
Three heavy components are dynamic-imported with skeleton fallbacks:
- `AnalyticsDashboard` (Recharts) → `AnalyticsSkeleton`
- `RichTextEditor` (`components/quiz/NotesEditor`) → minimal loader
- `AITutorPanel` → `AITutorSkeleton`

If you add Recharts, dialog libraries, or markdown renderers, dynamic-import them too.

---

## 5 · Backend services (only matter outside demo mode)

### Supabase
- Auth + Postgres. SQL schema lives in `supabase/migrations/`:
  - `001` — implied initial schema (profiles + auth). Not in the repo; assumes a standard Supabase setup with the `profiles` table from the schema comment at the top of `lib/supabase.ts`.
  - `002_performance_indexes.sql` — indexes + materialized view (`student_analytics`) + pg_cron schedule + partitioning + pg_partman block.
  - `003_student_personalization.sql` — `quiz_sessions`, `daily_streaks`, `bookmarks`, `notes`, `student_subject_stats` view, `get_student_streak(uuid)` RPC.
  - `004_jobs_table.sql` — `jobs` table for the QStash queue.
- **Apply order: 003 BEFORE 002**, because 002 indexes tables created in 003. Or run them in one transaction.
- Three env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-side workers only — never in a client component).

### Upstash Redis
- Caching layer (`lib/cache.ts`) + rate limiting (`lib/rate-limit.ts`).
- Env vars: `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`.
- TTL constants in `lib/redis.ts` are commented with the rationale per value (1h analytics matches the materialized view refresh, 24h questions for published content, 5min leaderboard for liveness, etc.).

### Upstash QStash
- Background job queue (`lib/queue.ts`).
- Env vars: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.
- The worker endpoint `/api/jobs/generate-questions` wraps its handler in `verifySignatureAppRouter` ONLY when `QSTASH_CURRENT_SIGNING_KEY` is set. In dev without the key, the handler runs unverified (for testing).
- For local dev with real QStash, expose your dev server via ngrok and set `NEXT_PUBLIC_APP_URL` to the tunnel URL.

---

## 6 · Things that will trip you up

1. **Quiz `useEffect` order.** Put all `useState` declarations BEFORE the effects that reference them. Production build runs in strict mode and a forward reference becomes a TDZ runtime crash, not a TS error.

2. **`useSearchParams` needs Suspense in Next 14.2+.** `/login` and `/student/results/histology` wrap their inner content in `<Suspense fallback={null}>` for this reason. If you add another page that calls `useSearchParams()`, do the same or `next build` will fail prerendering.

3. **`auth-helpers-nextjs@0.8` doesn't propagate `Database<T>`.** Don't try to "fix" the verbose `as unknown as { from: ... }` casts in API routes — they're a workaround for a known SDK limitation. The clean fix is migrating to `@supabase/ssr`, which is a non-trivial refactor and out of scope for the current build.

4. **Middleware passes through in demo mode.** If you're testing that a protected route correctly redirects to `/login`, you must set real Supabase env vars first — otherwise the middleware bypass kicks in and protected pages render with no session.

5. **Two `student/` segments in the URL path.** `app/(student)/student/dashboard/page.tsx` → `/student/dashboard`. The inner `student/` is intentional. New student pages go under `app/(student)/student/<name>/page.tsx`.

6. **`lucide-react@0.323` has older icon names.** Use `UploadCloud` (not `CloudUpload`), `AlertTriangle` (not `TriangleAlert`), `AlertCircle` (not `CircleAlert`). If `npm run build` fails with "Element type is invalid", check icon names first.

7. **Streak increment is a select-then-update race.** `/api/quiz/submit` and `/api/student/streak/complete` use a non-atomic select+update on `daily_streaks` because Supabase JS can't express `SET col = col + 1` through PostgREST. A single student can't UI-race themselves, but for bulletproof concurrency add a `bump_daily_streak(uuid)` RPC to a new migration.

8. **The `notes` table exists in the schema but isn't wired.** The Notes panel in the quiz writes to `useQuizStore.notes` (in-memory + persist), not to Postgres. Plumb `/api/student/notes/upsert` if you need cross-device persistence.

9. **The `next` package still has one outstanding HIGH vuln** (`HTTP request deserialization can lead to DoS when using insecure React Server Components`) — fix requires upgrading to Next 15, which is a breaking change. Deferred during the security audit.

---

## 7 · How the data flows (one quiz attempt, real mode)

1. Student clicks the Histology card on `/student/dashboard` (or `/student/subjects`).
2. `loadSession('histology')` checks for a saved session. If found, the Resume modal opens. If not, `startSession()` runs and routes to `/student/quiz/histology`.
3. Quiz page renders Phase 1 fullscreen. `fullscreenchange` listener tracks intentional vs unintentional exits.
4. For each question: `answerQuestion(id, choice)` writes to store → Submit → Phase 2 split view with feedback + per-choice rationale.
5. On the last question, `handleQuizComplete()` POSTs `{ subjectId, answers, startedAt }` to `/api/quiz/submit`.
6. Server validates with Zod → re-scores from canonical `histologyQuestions` → service-role inserts into `quiz_sessions` → upserts today's `daily_streaks` row → invalidates `studentAnalytics(uid)` + `leaderboard(subjectId)` caches → returns full `{ sessionId, score, total, accuracy, results[] }`.
7. Client calls `setLastResult(data)`, `clearSession()` (so the next visit starts fresh), routes to `/student/results/histology`.
8. Results page renders from `lastResult` (real mode) or URL query params (demo mode).

---

## 8 · Recent work (last few prompts, in case it's mid-flow)

- ✅ Subjects page built at `/student/subjects` with hero + carousel + features (`components/subjects/*`).
- ✅ Dr. Ahmed Zahra's photo added (`public/dr-zahra.jpg`) and wired into the hero with holographic frame + 3D mouse tilt.
- ✅ Security + QA audit pass: critical Next SSRF patched (14.1.0 → 14.2.35), 13 TS errors fixed, Zod validation added to `admin/remove-user` and `professor/upload`, `/api/questions/[subjectId]` auth-gated, Suspense added to two pages.
- ✅ Pushed to <https://github.com/zeyad-elmoghazy/MedZ-demo> (commit `6f7766d — Almost Done Project`).

---

## 9 · Open TODOs

1. Migrate `@supabase/auth-helpers-nextjs@0.8` → `@supabase/ssr` to clear the typing casts and pick up newer cookie-handling.
2. Add a `bump_daily_streak(uuid)` Postgres RPC and a `students_increment_streak` RLS policy so `/api/quiz/submit` can drop the select-then-update pattern.
3. Plan the Next 14 → 15 migration to clear the remaining HIGH-rated CVE.
4. Wire `/api/student/notes/upsert` so notes survive a localStorage wipe.
5. The professor dashboard's "Upload Content" tile is a placeholder — wire it to the existing `/api/professor/upload` flow if the demo grows.
6. There's no test suite. `npx tsc --noEmit` + `npm run build` are the only correctness gates right now.

---

## 10 · Commands cheat sheet

```bash
# Run dev (uses .env.local; demo mode active by default)
npm run dev

# Production build (catches Suspense + prerender errors)
npm run build

# Typecheck without emitting
npx tsc --noEmit

# Security audit
npm audit --json | jq

# Kill the dev server on 3000
lsof -ti:3000 | xargs kill -9

# Push your work (you're already tracking origin/main)
git add -p
git commit -m "..."
git push
```

---

## 11 · One-line summary to paste into a fresh Claude session

> Open `/Users/zeezo/Desktop/MedZ/medz-demo`. It's a Next.js 14 dark medical-quiz demo. Run `npm run dev` (port 3000). Demo mode is active because `.env.local` points at `https://demo.supabase.co`; the app self-serves via localStorage. URL `/student/dashboard` lives at `app/(student)/student/dashboard/page.tsx` (the double `student/` is intentional). Read `handoff.md` for the full context before editing.
