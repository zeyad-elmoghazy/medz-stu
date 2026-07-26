# MedZ — Adaptive medical learning

Next.js 14 (App Router) demo for an adaptive medical question bank, with student,
professor, and program-admin surfaces. Tailwind, shadcn-style components,
Framer Motion, Zustand state, Supabase auth scaffolding, and a Dr.&nbsp;Zahra–
authored Histology MCQ bank.

## Setup

### A. Demo mode (no backend, ~30 seconds)

```bash
npm install
cp .env.local.example .env.local
# The example already ships with NEXT_PUBLIC_DEMO=0. Flip to 1:
# NEXT_PUBLIC_DEMO=1
npm run dev
```

Auth uses `localStorage`, questions are served from the bundled
histology module, and any password logs you in. Perfect for
walking through the UI without provisioning anything.

### B. Real Supabase (test with real data)

**1. Create the Supabase project**

- Go to <https://supabase.com> → *New project*.
- Pick a strong DB password (store it in your password manager).
- Wait ~1 min for the project to provision.

**2. Apply the migrations**

**Option 1 — CLI (recommended):**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Files apply in filename order: `001 → 003 → 004 → 005`.

**Option 2 — SQL editor:**

Open Supabase → *SQL Editor* → paste each file in this order and click *Run*:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/003_student_personalization.sql`
3. `supabase/migrations/004_jobs_table.sql`
4. `supabase/migrations/005_performance_indexes.sql`

**3. Wire the env file**

Get these from Supabase → *Settings* → *API*:

```
NEXT_PUBLIC_DEMO=0
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from the API page>
SUPABASE_SERVICE_ROLE_KEY=<service_role key — server-only, never send to browser>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Leave the Upstash and QStash blocks empty for now — the app
degrades gracefully (see `lib/cache.ts` and `lib/queue.ts`).

**4. Seed the question bank**

```bash
npm run seed:questions
```

Idempotent — safe to re-run. Reads from `data/histology-questions.ts`
and INSERTs into `questions` with `ON CONFLICT (subject_id,
subject_bundle_id) DO NOTHING`. Requires the service role key.

**5. Boot the app**

```bash
npm run dev
```

Open <http://localhost:3000>, click *Create an account*, sign up
with a real email. Verify in the Supabase dashboard that:

- `auth.users` has your new user
- `profiles` has the matching row with your role (defaults to
  `student` — promote yourself to `admin` via
  `UPDATE profiles SET role = 'admin' WHERE email = '<you>';`)

Take the histology quiz. Verify:

- `quiz_sessions` gets a new row with your `score` and `accuracy`
- `daily_streaks` gets a row for today with `challenges_completed = 1`
- The dashboard reflects your real numbers (via `/api/student/stats`)

### Troubleshooting

- **App refuses to boot with "Missing NEXT_PUBLIC_SUPABASE_URL":**
  You set `NEXT_PUBLIC_DEMO=0` (or unset it) without providing
  real Supabase env. Either fill in the Supabase vars or set
  `NEXT_PUBLIC_DEMO=1`.
- **`seed:questions` fails with a permissions error:** you're
  probably using the anon key. It has to be `service_role`.
- **Quiz returns 400 "no published questions yet":** the
  `questions` table is empty for that subject. Run
  `npm run seed:questions` after applying migrations.

## Surfaces

- `/` — marketing landing
- `/login`, `/signup` — Supabase-backed auth screens
- `/dashboard` — student home (stats, weekly chart, subjects)
- `/quiz/[subjectId]` — split/focus MCQ runner with handwritten reference notes
- `/professor/dashboard` — cohort analytics, flagged questions, activity feed
- `/admin/dashboard` — program-level operations, MRR, partner status

## State

Quiz progress lives in `lib/store.ts` (Zustand with `localStorage` persistence):
`currentQuestionIndex`, `answers`, `bookmarks`, `notes`, `quizMode`,
`sessionComplete`, plus actions `answerQuestion`, `toggleBookmark`, `setNote`,
`nextQuestion`, `prevQuestion`, `jumpToQuestion`, `setQuizMode`,
`completeSession`, `resetSession`.

## Question bank

`data/histology-questions.ts` contains 11 medically accurate MCQs covering the
blood–brain barrier, epithelium classification, cell junctions, connective
tissue, pemphigus/desmosome pathology, goblet cells, hyaline cartilage,
osteoclasts, sarcomere mechanics, eosinophil identification, and germinal
centers — each with four choices, a 3–4 sentence explanation, and a
handwritten-style reference note attributed to Dr. Zahra.
