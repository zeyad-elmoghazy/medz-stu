# MedZ — Claude Code Project Instructions

You're picking up a live rebuild in progress. Read this whole file before making changes — it front-loads several hours of debugging and product decisions you'd otherwise have to rediscover.

## What this project is

MedZ is a medical education platform for Egyptian medical students, pivoting from a B2B model (one professor supplies content and students) to B2C (the founders, Zoz and Ammar, self-author/curate content). Full product spec, schema rationale, and the complete remaining task list: **`docs/MedZ_Complete_Master_Document_v2.md`** — read Part 10 of that doc first, it's the actual prioritized backlog. This file (`CLAUDE.md`) covers operational/stack-specific things the master doc doesn't.

You're on branch `b2c-pivot-rebuild`. Do not merge to `main` without the founders' sign-off — `main` is the last B2B build and still deployed/referenced elsewhere until this branch is verified.

## Read this before writing any Supabase query

`.from(table).update(...)` and `.from(table).insert(...)` resolve to a `never` argument type for most tables in this project's exact dependency combination (`@supabase/ssr@^0.12.3` + `@supabase/supabase-js@^2.39.3`), regardless of whether the table is correctly declared in `lib/supabase.ts`'s `Database` type. This was confirmed by trial — extending the `Database` type did not fix it. Every `.from()` call in this codebase (old and new) goes through:

```ts
import { untypedFrom } from '@/lib/supabase-server';
// ...
const { data, error } = await untypedFrom(supabase).from('questions').select(...);
```

not `supabase.from(...)` directly. Keep `supabase.auth.getUser()` and similar non-`.from()` calls on the typed client as normal. If you add a new table or a new route, use `untypedFrom(supabase)` from the start rather than hitting this error yourself.

Two related traps that each cost a full build-fix cycle finding:
1. **Multi-line chains need the fix too.** This codebase's dominant style is `supabase\n  .from('table')` — a naive same-line find/replace misses these. Check both patterns.
2. **Cast the array before `.map()`, not inside the callback.** `data.map((r) => (r as T).id)` still trips `noImplicitAny` on `r`. Use `(data as T[]).map((r) => r.id)` instead.

## Verification workflow — non-negotiable

Run `npm run build` (or `npx tsc --noEmit` for a faster pure-type-check) after every meaningful change — not once at the end of a big batch. This codebase has ~15 admin API routes and a 1,700-line dashboard page; a single systemic mistake (like the `never`-collapse above) will repeat across every file that shares the pattern, and it's much cheaper to catch after one file than after fifteen. If you're an agent that can run shell commands directly, you have a real advantage here over how this branch was built so far — most of it was written and reasoned through in a sandbox with no working `npm install`, verified only by careful reading and manual brace-counting, then fixed in a slow loop of the founder running the build locally and pasting errors back. You don't have to work that way — use it.

Also worth doing early: `npm audit` flagged 6 high-severity vulnerabilities on the last install. Not blocking, but worth a look before this goes anywhere near production.

## Things that were deliberately removed — do not reintroduce without an explicit founder decision

- **Professor role.** No `app/(professor)/*`, no `/api/professor/*`, no `role === 'professor'` anywhere. `profiles.role` CHECK constraint is `('student', 'admin')` only. If you find a stray reference to a professor role or professor-owned content, that's leftover debt to clean up, not a feature to preserve.
- **AI Tutor.** Fully removed, not even a "Coming Soon" tease. Needs a fresh product/cost decision to bring back (see master doc Part 1.5).
- **Post-Lecture** (Kahoot-style live challenge). Fully removed — it needs a professor actively running a live session, which requires a professor partnership MedZ doesn't currently have.

## Where things stand right now

**Done:** schema rebuild (multi-subject/module taxonomy, admin-only RLS, social tables, activity log — see `supabase/migrations/015_b2c_pivot_rebuild.sql` and `016_admin_activity_log.sql`), professor/AI-Tutor/Post-Lecture removal, and the full Admin Dashboard **backend** (all 7 sections' API routes under `app/api/admin/`).

**Not done, in priority order** (see master doc Part 10 for full detail on each):
1. Admin Dashboard **frontend** — `app/(admin)/admin/dashboard/page.tsx` is still the old pre-pivot 1,700-line file and hasn't been touched. The backend it needs already exists.
2. B2C social features — usernames/friends, streaks with goals, friend streaks, global XP leaderboard. Schema exists, nothing else does.
3. Custom Exam builder — also blocked on the fact that the student-facing subjects/modules browsing UI is still hardcoded to a single static Histology-only catalog (`data/histology-catalog.ts`) rather than the real DB-driven multi-subject taxonomy.
4. VLM-based MCQ extraction (replacing the current working-but-not-spec'd pdf-parse+regex/Tesseract pipeline in `app/api/admin/upload/route.ts`).
5. Flashcards (Phase 2, explicitly lowest priority — don't let it eat time that tasks 1-4 need).

## Conventions to keep following

- Every admin route checks `profiles.role === 'admin'` server-side (RLS is the backstop, not the only gate).
- Every write is Zod-validated before touching the database.
- Every question status change and taxonomy edit calls `logActivity()` from `lib/admin-activity.ts` — one shared `activity_log` table backs both the Overview feed and per-question edit history.
- Questions are soft-deleted (`status = 'archived'`), never hard-`DELETE`d.
- A chapter with `question_count > 0` refuses to hard-delete — re-tag or archive its questions first.
- Any publish/archive/edit-while-published on a question invalidates the relevant Redis cache keys (`CACHE_KEYS.subjectList()`, `CACHE_KEYS.questionBank(subjectSlug)`).

## GitHub push access

The founder has been generating short-lived personal access tokens for push access during this build. If you need to push and don't have credentials configured, ask rather than guessing — don't try alternate auth flows.
