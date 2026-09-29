# Session handoff — 2026-08-23

Written for whoever (human or Claude) picks this up next. Every claim in this
document was checked fresh against the actual repo/git/database state on
2026-08-23, not carried over from how earlier chat turns described it —
that discipline caught a real broken build during this exact write-up (see
§3). Trust this document's numbers over any earlier summary of this
session, including the assistant's own.

---

## 1 · Status at a glance

| | |
|---|---|
| **Active branch** | `Testing` — the branch actually moving forward |
| **Local `Testing` HEAD** | `86d433a` |
| **`origin/Testing`** | matches local exactly (fetched + SHA-compared, not just "push succeeded") |
| **Build (`next build`)** | ✅ passes clean — verified for real this session, not assumed |
| **Test suite (`npm test`)** | ✅ 70/70, run twice back-to-back, zero DB/storage residue after each |
| **`schema-migration`** | 2 commits **behind** `Testing` (`e25c160`) — stale, not currently a mirror |
| **`main`** | 1 commit, pre-pivot architecture, builds fine — **does not have any of the b2c pivot**. Very likely what's actually deployed to `meds-demo` (production) today |
| **`b2c-pivot-rebuild`** | independent sibling, never merged — donor branch the admin-content surface was re-ported *from*, not synced with |
| **MedZ-Stu migrations** | 001–019 applied, disk matches DB exactly |
| **Known issue on MedZ-Stu** | `_rls_adversarial_test_results` (23 rows, RLS-suite leftover) has RLS disabled, publicly exposed via PostgREST — flagged, not fixed |

**One-line status**: the professor-role removal + b2c pivot + book-reference system + admin content surface + its test coverage are all done, verified, and on `Testing`/`origin/Testing`. Nothing has been merged toward `main`, and `main` is stale — that merge is a real, unstarted decision point (§6).

---

## 2 · Branch state (verified fresh, not from memory)

```
Testing            86d433a  (ahead of schema-migration by 2, ahead of main by 81 files)
schema-migration    e25c160  (2 commits behind Testing — missing this session's test-coverage + build-fix commits)
main                0b02af1  (single "Initial commit" — ancestor of Testing, pre-pivot, presumed = meds-demo prod)
b2c-pivot-rebuild   1dfbfee  (independent sibling of main, never merged anywhere)
```

- `git merge-base --is-ancestor schema-migration Testing` → **yes**. `Testing` is a clean fast-forward ahead; nothing on `schema-migration` is missing from `Testing`. The reverse is what's true: `Testing` has 2 commits `schema-migration` doesn't (`0ea70d1` test coverage, `86d433a` build fix). If `schema-migration` still matters as a branch, it needs fast-forwarding; if `Testing` has fully superseded it, that's worth an explicit decision to retire it rather than leaving it silently stale.
- `git merge-base --is-ancestor main Testing` → **yes**, `main`'s single commit is the literal root of `Testing`'s history. This is not a diverged-and-needs-reconciling relationship — `Testing` is a strict superset, 81 files different, +6687/−2263 lines. A merge (or a deliberate rebase/squash onto `main`) is mechanically simple whenever it's decided to do it; nothing about the git history itself blocks it.
- `main` was **built in an isolated git worktree** (`git worktree add /tmp/medz-main-check main --detach`) rather than assumed working from its file listing — `npx next build` there completed clean once pointed at `.env.local` (production builds read `.env.local`, not `.env.development.local` — tripped over this exact distinction verifying it). Confirms `main` is a real, currently-buildable app, just the pre-pivot one: it still has `/professor/dashboard`, `/api/professor/*`, `/student/challenges` (Post-Lecture — removed on `Testing` earlier this session), notes-page references instead of book references. Worktree removed after the check.
- `b2c-pivot-rebuild` vs `Testing`: **not** an ancestor either direction — genuinely independent history from the same `main` root. `Testing`'s `/api/admin/content/*` routes and admin frontend were a from-scratch re-port of what this branch pioneered, not a merge of it (see `9afc858`, `674cf1f`). The 101-file / +14322/−2084 diff size is expected given that.

---

## 3 · Resolving this session's two open technical questions

### 3a. Was the test env-loading real, or shell-dependent?

`jest.config.ts` has no `setupFiles` — that's confirmed, still true. But the
three new integration tests (`__tests__/integration/*.test.ts`) don't rely on
that: `__tests__/helpers/supabase-test-env.ts` reads
`.env.development.local` directly via `fs.readFileSync` at module load,
before any `describe`/`test` runs.

Checked, not assumed: this shell had none of
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
exported (`env | grep` came back empty), and no shell profile
(`.zshrc`/`.zprofile`/`.bashrc`/`.bash_profile`/`.profile`) references
`SUPABASE` at all. Then ran the suite in `env -i HOME="$HOME" PATH="$PATH"
USER="$USER" npx jest __tests__/integration/` — a subprocess with nothing
inherited beyond those three bare variables. **10/10 passed.** The loading
mechanism is real and shell-independent. No fix was needed; nothing to
change here.

### 3b. Does `next build` actually tolerate the `jest.config.ts` changes?

It had never been run. It was run this session, and **it failed** — not
because of the `moduleNameMapper` server-only stub or
`testPathIgnorePatterns` (both turned out to be fine), but because
`next build`'s TypeScript pass checks the entire repo
(`tsconfig.json`: `include: ["**/*.ts", ...]`, only `node_modules`
excluded — `__tests__/` was never scoped out), and 8 type casts in the new
integration test files (`as SupabaseClient<any>`, working around
`jest.MockedFunction<typeof createRouteHandlerClient>` collapsing that
function's generic to `SupabaseClient<unknown, never, never, never,
never>`) failed under `tsc` even though `ts-jest` had silently accepted
them.

Fixed by switching those 8 sites to `as any` and removing the
now-unused `SupabaseClient` type import in both affected files
(`require-admin.test.ts`, `import-route-idempotency.test.ts`) — a
type-only change, zero runtime effect, re-verified at 70/70 after. `next
build` now completes end to end (`✓ Compiled successfully`, `Finished
TypeScript`, full route table generated). Committed as `86d433a`, pushed,
`origin/Testing` reconfirmed identical via a fresh fetch + SHA compare.

**This directly contradicts the earlier assumption that these
`jest.config.ts` changes were safe.** They were safe *for Jest*; the actual
break was a separate, unconsidered interaction between the new test files
and the *build's* type-checking scope. Naming it plainly per instruction,
not folding it in quietly: the build was broken on `Testing` from `0ea70d1`
until `86d433a` fixed it a few minutes later in the same session — it was
never pushed in a broken state, but it did exist that way locally for a
short window.

---

## 4 · What's actually shipped (on `Testing`, pushed to `origin/Testing`)

- **Professor role fully removed**: no `app/(professor)/*` route group reachable (proxy.ts's `/professor` prefix entry removed), `profiles.role` no longer permits `'professor'`, Post-Lecture Challenges feature deleted outright.
- **B2C pivot schema** (`015_b2c_pivot_rebuild.sql`, `016_admin_activity_log.sql`, `017_rls_findings_cleanup.sql`): multi-subject/module taxonomy, admin-only RLS, activity log. Both 015 and 019 verified idempotent by double-apply on MedZ-Stu.
- **Book-reference system replacing notes-page references**: `modules.book_id` + `questions.external_id` (`019_module_book_and_import_idempotency.sql`), shared `getSignedBookPageUrl()` resolver (`lib/book-reference.ts`), student-facing `ReferenceCard` UI updated to book-only framing, `notes-pages` bucket made private with a service-role signed-URL path.
- **`POST /api/admin/questions/import`**: JSON bulk import, upserts by `external_id`, live-tested against a real 63-question file earlier this session and now covered by a persisted idempotency test.
- **13 admin routes ported** from `b2c-pivot-rebuild` to `/api/admin/content/*`, consolidated under one `requireAdmin()` gate (fixed a real missing-role-check bug on the old `admin/subjects` GET in the process), rewritten for the book model, dead professor routes deleted.
- **New admin frontend** under `/admin/content/*` (Overview / Upload / Review / Modules tabs) — built fresh, not wired to the old `components/professor/*` data layer (a deliberate, flagged deviation from a literal "reuse" reading of the porting spec).
- **`/api/admin/overview` kept but unwired**, per explicit instruction, with a doc comment explaining it holds real capability (per-author activity, professor_id-derived author count) not yet ported into `/api/admin/content/overview` — a live decision point, not dead code by accident.
- **Test coverage for all of the above's new surface** (this session): `require-admin.test.ts`, `import-route-idempotency.test.ts`, `book-reference-resolver.test.ts` — real MedZ-Stu, self-cleaning every run, verified twice with zero residue. Full suite: 60 → 70.
- **`Testing` merged from `schema-migration`** earlier this session (fast-forward, no Vercel project connected to this repo yet so that precondition didn't apply), then advanced 2 further commits that `schema-migration` itself doesn't have (§2).

---

## 5 · Corrections to this session's own prior narration

Per the instruction to name contradictions plainly rather than reconcile them quietly:

1. **The `jest.config.ts` changes were not actually verified safe when they were first described as such** — reasoned-through, not tested. `next build` was genuinely broken for part of this session (§3b) before this handoff pass caught and fixed it.
2. **`schema-migration` is not current** — it was treated as the working branch earlier this session and then left behind once `Testing` absorbed it; two real commits now exist only on `Testing`.
3. Two other trust-boundary corrections happened earlier in this session (referenced by the user's own framing, from before this document's fresh-verification pass): a migration idempotency fix that turned out to already be committed without ever being explicitly called out as its own commit, and a branch-deletion that had been reported as done but hadn't actually happened. Both were caught by direct verification rather than trusting prior narration — same discipline this document was built with. Full detail on those two lives in this conversation's history, not restated here since they predate and aren't part of this document's own fresh checks.

---

## 6 · What's genuinely still open

**Decision points with no answer on record:**
- **`Testing` → `main` merge**: mechanically simple (`main` is a strict ancestor), but unstarted, and `main` is very likely live production (`meds-demo`) right now running the pre-pivot app. No Vercel project is connected to this repo yet (checked via the Vercel MCP connector earlier this session — zero projects under the only available team) — that gate will matter once Vercel is wired up, but isn't blocking today. This needs an explicit founder go/no-go, not a default.
- **`/api/admin/overview` vs `/api/admin/content/overview`**: still an open fork, by design — someone needs to decide whether to port the per-author activity breakdown in or formally retire the old route.
- **`schema-migration`**: fast-forward it to match `Testing`, or retire it as superseded? Currently just silently stale.
- **`docs/MedZ_Complete_Master_Document_v2.md`** (the actual product spec + prioritized backlog) only exists on `b2c-pivot-rebuild` — it was never carried over to `Testing`, which is the branch actually moving forward now. Worth a deliberate decision to port it (or a successor) rather than `Testing` continuing without a single source of product truth.

**Backlog items from that master doc, checked against `Testing`'s actual current state, not assumed carried-over:**
- **B2C social features** (usernames/friends, streaks with goals, leaderboard) — schema-only, no UI. Not touched this session.
- **Custom Exam builder** — **partially** unblocked, not fully: `student/subjects/page.tsx` is DB-driven now, but `data/histology-catalog.ts` (the static single-subject catalog) is still directly referenced by `student/exam/page.tsx`, `student/subjects/[subjectId]/page.tsx`, and `student/subjects/[subjectId]/[moduleCode]/page.tsx`. Verified by grep this session, not assumed resolved by the taxonomy work being done elsewhere.
- **VLM-based MCQ extraction** — not started; the OCR pipeline (`__tests__/ocr/pipeline.integration.test.ts`) is still the working Tesseract-based one.
- **Flashcards** — explicitly lowest priority in the master doc, untouched.

**Housekeeping found this pass, not acted on (flagged per scope discipline, not silently fixed):**
- `_rls_adversarial_test_results` on MedZ-Stu: RLS disabled, publicly exposed via PostgREST, 23 leftover rows. The adversarial suite (`supabase/tests/rls_adversarial_015_016.sql`) has no saved cleanup script despite its own header referencing one.
- Three `SECURITY DEFINER` functions (`is_admin()`, `get_professor_stats()`, `get_student_streak()`) are callable by `anon`/`authenticated` roles per Supabase's advisor — plausibly intentional (typical pattern for this kind of cross-table check), not verified either way this pass, just surfaced.

**Named in the request but not found anywhere I could verify — flagging rather than fabricating:**
The request asked this document to cover "ready-to-run prompts not yet executed" and "the pre-launch checklist items." I searched the repo (`docs/`, root `*.md` files, `handoff.md`) and found no file matching either description — `handoff.md` at the repo root is untouched since `main`'s initial commit and describes the old pre-pivot app (Next 14, `/professor/analytics`, demo-mode-first) with no such checklist either. If these exist, they're most likely recorded only in earlier turns of this conversation that predate what's available to this document's author, not as a repo artifact. Rather than guess at their contents, this is flagged as an open item for whoever has access to that earlier context to fold in — do not treat their absence here as "checked and clear."

---

## 7 · Where to look next

- `docs/SESSION_FINDINGS_2026-08-17.md` — a separate, earlier hardening pass on `Testing` (lint debt, real bugs fixed, a content-backup for since-archived questions). Independent of this document; still relevant context if touching the same surfaces.
- `git show b2c-pivot-rebuild:docs/MedZ_Complete_Master_Document_v2.md` and `git show b2c-pivot-rebuild:CLAUDE.md` — the actual product spec and prioritized backlog referenced throughout §6, currently only reachable by branch, not on `Testing`.
