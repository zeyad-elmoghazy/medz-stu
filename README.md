# MediZee — adaptive medical question bank

Next.js 16 (App Router) + React 19 + Supabase (auth, Postgres, storage) for Egyptian medical
students. Students browse a year → module → subject → chapter catalogue, take chapter quizzes
backed by the database, earn XP and streaks, and climb a leaderboard. Admins manage content
(modules, subjects, chapters, books, questions) through `/admin/content` and a PDF/OCR upload
wizard. Styling is Tailwind + CSS variables; client state uses Zustand.

Production runs on **Vercel** (merge to `main` auto-deploys; every PR gets a Preview) against a
hosted Supabase project. Migrations are applied to Supabase by hand — a deploy never runs them.

## Routes

| Area | Path |
| --- | --- |
| Marketing | `/`, `/privacy`, `/terms` |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm` |
| Student | `/student/dashboard`, `/student/catalogue/...`, `/student/quiz/chapter/[chapterId]`, `/student/results/chapter/[chapterId]`, `/student/bookmarks`, `/student/leaderboard`, `/student/profile` |
| Admin | `/admin/content` |
| API | `/api/student/*`, `/api/admin/*`, `/api/auth/login`, `/api/health` |

`proxy.ts` is the request gate (session refresh, role-based redirects, rate limiting).

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Environment variables (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser + server auth.
- `SUPABASE_SERVICE_ROLE_KEY` — server only; admin routes and scripts. Never expose it.
- `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN` — optional caching and rate limiting; both degrade
  to no-ops when unset.
- `NEXT_PUBLIC_DEMO=1` — opt-in demo mode (localStorage auth, no backend). **Never set this in
  production**: it makes `proxy.ts` wave every request through.

## Database

Migrations live in `supabase/migrations/` (001–031; there is intentionally no 002) and are applied
in filename order. `supabase/seed.sql` is for local stacks only — never run it against a hosted
project. `supabase/tests/` holds the SQL RLS/hardening checks.

Run a throwaway local stack with the Supabase CLI:

```bash
supabase start      # applies migrations, then supabase/seed.sql
supabase status     # local URL + keys to put in .env.local
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, serve the build |
| `npm run lint` | ESLint |
| `npm test` | Jest. Unit tests run anywhere; `__tests__/integration/*` need Supabase env vars and write real rows, so point them at a **local** stack, never production |
| `npm run test:ocr` | OCR MCQ parser tests |
| `npm run test:ocr:integration` | OCR pipeline test against `__tests__/fixtures/demo-questions.pdf` |
| `npm run seed:curriculum` | Seed the module/subject/chapter curriculum from `scripts/seed/medizee-curriculum-seed.json` |
| `npm run cleanup:legacy-placeholder-chapters` | One-off cleanup of early placeholder chapters |

## Layout

- `app/` — pages and API routes. `components/` — UI. `lib/` — Supabase clients, auth guards,
  caching, rate limiting, OCR (`lib/ocr/`), and API helpers.
- `scripts/` — seeding and content-import tooling. `docs/` — product document.
- `__tests__/` — unit, integration, security and OCR tests.
