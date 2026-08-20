# Adversarial RLS test results — migrations 015/016

Run against `MedZ-Stu` (Supabase project ref `usiuoyvrphitqsyxwoty`), a
dedicated non-production project, after applying the full migration
chain 001–016 (professor-role-removal / B2C pivot). Never run against
`meds-demo` (production, ref `xotmtvfpkthuuyumnkzf`).

Test script: [`rls_adversarial_015_016.sql`](./rls_adversarial_015_016.sql).
Uses real Supabase `auth.uid()`/`auth.role()` — impersonation via
`set_config('role', ...)` + `set_config('request.jwt.claims', ...)`,
the same GUCs PostgREST sets per-request in production. Not stubbed.

**Result: 23/23 passed.** Fixtures (4 disposable `auth.users` rows and
their cascaded rows) were deleted after the run — verified zero
leftover rows in `auth.users`, `profiles`, `activity_log`, `modules`.

| # | Test | Expected | Actual | Passed |
|---|------|----------|--------|--------|
| 1 | FIXTURE: create 4 auth.users (triggers 006 profile auto-create) | succeeds | succeeded | ✅ |
| 2 | FIXTURE: promote admin via service_role UPDATE | succeeds | succeeded | ✅ |
| 3 | T1: service_role sets role=professor | CHECK constraint violation (blocked) | blocked: new row for relation "profiles" violates check constraint "profiles_role_check" | ✅ |
| 4 | T2: student self-elevates to admin | blocked (trigger: role change forbidden) | blocked: role change forbidden (caller role: authenticated) | ✅ |
| 5 | T3: student_a elevates student_b to admin | 0 rows affected (RLS: not own row) | 0 rows affected | ✅ |
| 6 | T20: profiles rows with role=professor | 0 | 0 | ✅ |
| 7 | FIXTURE: student_a creates quiz_session/note/friend-request | succeeds (own rows) | succeeded | ✅ |
| 8 | T4: student_b SELECTs student_a quiz_sessions | 0 rows visible | 0 rows visible | ✅ |
| 9 | T5: student_b UPDATEs student_a quiz_sessions | 0 rows affected | 0 rows affected | ✅ |
| 10 | T6: student_b DELETEs student_a quiz_sessions | 0 rows affected | 0 rows affected | ✅ |
| 11 | T7: student_b SELECTs student_a notes | 0 rows visible | 0 rows visible | ✅ |
| 12 | T8: bystander SELECTs student_a/b friend request | 0 rows visible | 0 rows visible | ✅ |
| 13 | T9 (positive control): addressee SELECTs own friend request | 1 row visible | 1 rows visible | ✅ |
| 14 | T10 (positive control): anon SELECTs modules | > 0 rows visible | 9 rows visible | ✅ |
| 15 | T11: anon INSERTs into modules | blocked (RLS policy violation) | blocked: permission denied for function is_admin | ✅ (see note) |
| 16 | T12: non-admin student UPDATEs modules | 0 rows affected | 0 rows affected | ✅ |
| 17 | T13: non-admin student DELETEs chapters | 0 rows affected | 0 rows affected | ✅ |
| 18 | T14 (positive control): non-admin student SELECTs chapters | > 0 rows visible | 79 rows visible | ✅ |
| 19 | T15: non-admin student SELECTs activity_log | 0 rows visible | 0 rows visible | ✅ |
| 20 | T16: non-admin student INSERTs into activity_log | blocked (RLS policy violation) | blocked: new row violates row-level security policy for table "activity_log" | ✅ |
| 21 | T17 (positive control): admin INSERTs into activity_log | succeeds | succeeded | ✅ |
| 22 | T18 (positive control): admin SELECTs activity_log | >= 1 row visible | 1 rows visible | ✅ |
| 23 | T19 (positive control): admin UPDATEs modules | 1 row affected | 1 rows affected | ✅ |

## Findings

**No security holes found.** Every negative test (cross-user access,
self-elevation, professor-role reinstatement, non-admin writes to
admin-only tables/policies) was blocked; every positive control
(admin writes, public reads, addressee-visible rows) succeeded —
confirming the negatives are real RLS enforcement, not just missing
test data.

**Worth noting, not a vulnerability (test #15):** an anonymous INSERT
into `modules` is blocked, but with `permission denied for function
is_admin` rather than a clean RLS policy-violation message. Cause:
`modules_admin_write`'s `USING` clause queries `profiles`, and
`profiles` itself has RLS (`profiles_admin_select USING (is_admin())`)
— evaluating that nested policy invokes `is_admin()`, and migration
012 revoked `EXECUTE` on `is_admin()` from `anon`. The request still
fails closed (blocked either way), but surfaces as an internal
permission error rather than a normal 403-style rejection. Might be
worth a `GRANT EXECUTE ON FUNCTION is_admin() TO anon` in a follow-up
migration purely for error-message cleanliness — not urgent, not
exploitable.

**Dead policy, not a vulnerability:** `professors_read_sessions` on
`quiz_sessions` (and its partitioned equivalent from 012) checks
`profiles.role = 'professor'`, which can now never match — 015's
tightened `CHECK` constraint makes that role structurally impossible
(confirmed by test #3 above). The policy fails closed permanently; it
grants no one access. Cosmetic cleanup for the follow-up app-code /
schema-cleanup task, not a fix that needs to happen now.
