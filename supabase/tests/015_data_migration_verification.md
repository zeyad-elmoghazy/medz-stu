# Migration 015 data-migration verification

Run against `MedZ-Stu` (Supabase project ref `usiuoyvrphitqsyxwoty`) — a
disposable test project, not the launch database. A separate project
will be created later for actual launch; this project may be discarded
or reset at any time. `meds-demo` (production) was never touched.

## 1. Idempotency check

Migration 015 is **not idempotent**. Re-running the exact same SQL a
second time against a database it's already applied to fails on the
first non-guarded statement:

- `ALTER TABLE chapters ADD CONSTRAINT chapters_module_subject_slug_key UNIQUE (...)` has no `IF NOT EXISTS` guard — Postgres has no such syntax for constraints — and errors with `constraint ... already exists`.
- `CREATE POLICY "chapters_admin_write"`, `"modules_admin_write"`, `"questions_admin_write"`, and every policy on the five new tables (`subjects`, `module_subjects`, `friends`, `friend_streaks`, `streak_commitments`, `badges`, `reference_books`, `reference_pages`) have no preceding same-named `DROP POLICY IF EXISTS` and would error with `policy ... already exists`. (Only `questions_read_published` is genuinely drop-then-recreate.)

**Approach taken: reset to pre-015 state**, not a blind retry. Rather than a full `DROP SCHEMA public CASCADE` (which would risk losing Supabase's schema-level default-privilege grants for `anon`/`authenticated` that aren't captured in any migration file), the revert was surgical — every table/column/policy/constraint 015 or 016 touched, reverted individually, with `chapters` handled row-precisely (`DELETE ... WHERE subject_id <> histology_id`, not blind `(module_code, slug)` matching — module 206's histology chapters share slugs with its 015-added anatomy/physiology chapters, so a slug-only match kept duplicates on the first attempt; fixed to key off `subject_id`, which is unambiguous).

Verified against the known pre-015 baseline before proceeding: 22 chapters (not 79), 6 modules (not 9), all six 015-added tables absent, `chapters.subject_id` column absent, `profiles.username`/`total_xp` absent, `profiles_role_check` allowing `student`/`professor`/`admin`, and the three original `*_professor_write` policies restored.

## 2. Fixture data seeded

4 professor profiles, obviously fake (`fixture.professor.{one..four}@example.com`, `FIXTURE`/`FAKE-101` naming):

- **Professor one** (`f1111111-…`): owns a module (`FAKE-101`), a question (`subject_bundle_id=90001`), and an `upload_jobs` row — full ownership pattern.
- **Professor two** (`f2222222-…`): owns one question (`subject_bundle_id=90002`) only — partial ownership.
- **Professors three/four**: no dependent rows — pure role-flip cases.

## 3. Migration 015 re-apply — critical finding

The **first** re-apply attempt (unmodified migration, run via `apply_migration` — the same real pathway Supabase's CLI/dashboard use) **failed**:

```
ERROR: 42501: role change forbidden (caller role: none)
CONTEXT: PL/pgSQL function prevent_role_elevation() line 11 at RAISE
```

Migration 013's `enforce_role_immutability` trigger only permits a `profiles.role` change when `current_setting('role', true)` resolves to `'service_role'`. Diagnosed via two probe migrations:

| Probe | current_user | session_user | `role` GUC | `request.jwt.claim.role` |
|---|---|---|---|---|
| Bare `apply_migration` connection | `postgres` | `postgres` | `none` | `<null>` |
| After `SET LOCAL ROLE service_role;` | `service_role` | `postgres` | `service_role` | `<null>` |

**This is a real, previously-invisible bug.** The first time 015 ran (last testing session), `profiles` was empty — the `UPDATE profiles SET role='admin' WHERE role='professor'` matched **zero rows**, so the row-level trigger never fired, and the migration "succeeded" without ever exercising this path. The instant real `role='professor'` rows exist — which will be true on the actual launch database the moment any professor has signed up — this migration fails outright and **the entire transaction rolls back**, not just the UPDATE. Verified: after the failed attempt, `subjects` table absent, 22 chapters, `profiles_role_check` still 3-valued, all 4 fixture professor rows untouched — clean rollback, no partial damage.

**Fix applied to `supabase/migrations/015_b2c_pivot_rebuild.sql`:** wrap only the role UPDATE in `SET LOCAL ROLE service_role; ... RESET ROLE;`, scoped as tightly as possible so every object 015 creates before and after that UPDATE stays owned by `postgres` as before (a wider `SET ROLE` for the whole migration would silently change object ownership on everything created afterward). Confirmed `current_user=postgres` can freely `SET ROLE service_role` (superuser) before committing to this fix.

**Second attempt — corrected migration — succeeded.** Verified:

| Check | Result |
|---|---|
| Rows migrated `role='professor' → 'admin'` | **4** (all 4 fixtures) |
| Remaining `role='professor'` rows | 0 |
| `profiles_role_check` | `CHECK (role = ANY (ARRAY['student','admin']))` |
| Trigger fired and allowed the change | Yes — confirmed via the successful transaction (013's sanity-check `DO` block would itself abort the migration if the trigger were missing) |
| Professor one's module (`FAKE-101`) `professor_id` | unchanged, resolves to the same row (now `role='admin'`) |
| Professor one's question (90001) `professor_id` | unchanged |
| Professor one's `upload_jobs` row `professor_id` | unchanged |
| Professor two's question (90002) `professor_id` | unchanged |

Dependent `professor_id` values are plain UUID foreign keys with no trigger tied to `role` — the role flip doesn't touch them at all, which is exactly what was verified rather than assumed. Migration 016 applied cleanly afterward (no role-mutating statements — confirmed by grep across both files and the full migration set; only line 260 of 015 touches `profiles.role`).

**This fix needs to carry forward into whatever becomes the actual launch migration** — it's the single most important finding from this whole testing effort.

## 4. Orphan/integrity sweep

All FK-dependent tables checked for rows whose parent `profiles` reference is missing:

| Table | Orphans found |
|---|---|
| `bookmarks` | 0 |
| `notes` | 0 |
| `question_flags` | 0 |
| `modules` (`professor_id`) | 0 |
| `questions` (`professor_id`) | 0 |
| `upload_jobs` (`professor_id`) | 0 |
| `violations` | 0 |
| `quiz_sessions` | 0 |
| `daily_streaks` | 0 |
| `jobs` (`professor_id`) | 0 |

Fixture dependent rows confirmed still present and not duplicated (1 module, 2 questions, 1 upload_job).

## 5. RLS findings fixed (`supabase/migrations/017_rls_findings_cleanup.sql`)

1. **`is_admin()` EXECUTE grant.** Migration 012 revoked `EXECUTE` on `is_admin()` from `PUBLIC, anon` without an explicit re-grant to `authenticated`, but `profiles_admin_select`'s policy body calls it. Any query forcing evaluation of that policy for a role lacking `EXECUTE` (always `anon`; `authenticated` too, in the one case where its own `profiles_owner_select` disjunct doesn't already short-circuit it) failed with `permission denied for function is_admin` instead of a clean RLS rejection — still blocked either way, just a rougher error. Fixed: `GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;`. `is_admin()` takes no arguments and returns a boolean about the calling user only (`false` for `anon`, since `auth.uid()` is null) — safe to expose directly.
2. **Dead `professors_read_sessions` policy.** Present on `quiz_sessions` plus `quiz_sessions_partitioned` and all 13 of its monthly/default children (applied per-partition by migration 012, since partitions don't inherit parent policies). Checked `profiles.role = 'professor'`, which 015's tightened `profiles_role_check` makes permanently impossible to satisfy — fails closed, grants no one anything, but is now dead clutter. Dropped everywhere it appeared (15 policies total) via a `DO` block iterating `pg_policies`.

Verified post-fix: 0 remaining `professors_read_sessions` policies anywhere; `has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')` and the `authenticated` equivalent both `true`.

## 6. Full RLS suite re-run (regression check)

Re-ran [`rls_adversarial_015_016.sql`](./rls_adversarial_015_016.sql) unchanged. **23/23 passed — no regressions.** Notably, test 15 (anon INSERT into `modules`) now fails with the clean, expected message:

```
blocked: new row violates row-level security policy for table "modules"
```

— replacing the previous `permission denied for function is_admin`, confirming the `is_admin()` grant fix resolved the rough error path without weakening the block itself (still correctly rejected either way).

## 7. Cleanup

All fixture rows deleted — both this session's professor fixtures (`fixture.professor.*@example.com` and their dependent module/questions/upload_job) and the RLS suite's own fixtures (`rlstest.*@example.com`). Verified zero residue: 0 leftover `auth.users`, `profiles`, `activity_log`, `modules`, `questions`, `upload_jobs`, `friends`, `quiz_sessions`, `notes` rows tied to any fixture. `profiles` is back to 0 rows.

## Migration files touched this session

- `supabase/migrations/015_b2c_pivot_rebuild.sql` — added `SET LOCAL ROLE service_role; ... RESET ROLE;` around the role UPDATE (bug fix, see §3).
- `supabase/migrations/017_rls_findings_cleanup.sql` — new migration (see §5).
