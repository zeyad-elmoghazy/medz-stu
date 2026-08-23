# MedZ — Complete Master Document

**Version 2.0 — B2C Pivot**
Platform: MedZ — Medical Education Platform for Egyptian Medical Students
Founders: Zoz & Ammar
Date: August 2026
Status: Pivoting from B2B (professor-led) to B2C (self-authored content) — targeting live deployment within days for summer repeat-module students, full module/subject/chapter catalog targeted for readiness by the start of the new academic year.

---

## Changelog from v1.0 (June 2026)

| Change | v1.0 | v2.0 |
|---|---|---|
| Business model | B2B — one professor (Dr. Ahmed Zahra) uploads content, brings his own students | B2C — Zoz + Ammar author/curate content themselves, two graduate-student reviewers validate it |
| Why | Professor partnership was the acquisition + content engine | Dr. Zahra partnered with Coursology instead; that channel is gone for now |
| Professor Dashboard | Full feature (upload, roster, analytics) | **Removed entirely.** No professor role, no professor branding, no professor-facing routes |
| Content taxonomy | Flat `subject_id` text field, single-level | **Module → Subject → Chapter**, three-level, with Subjects shared many-to-many across Modules |
| Content source | Professor's own lecture notes/PDF, OCR'd automatically | MCQ books/files authored by professors, reviewed offline for accuracy by two trusted graduate students (no platform access), then entered/published by Zoz + Ammar via Admin Dashboard (AI-assisted) |
| Reference system | Manual crop of professor's PDF per question | Book-and-page lookup: digitize source books once, tag questions/chapters with `book_id + page_number` |
| Monetization | Freemium subscription, professor-driven acquisition (near-zero CAC) | Free at launch, monetize later. CAC is no longer near-zero, but GTM is resolved (Part 9.2): existing Telegram community, social media teasers, medical-influencer network |
| New features | — | Custom Exam builder (Module→Subject→Chapter), Streaks, Friend Streaks, email streak-loss notifications, usernames/friends, Leaderboard, Flashcards (deprioritized to Phase 2) |
| Trust signal | Dr. Zahra's photo/credentials as hero | **Open design problem** — no named authority anymore, needs a new hero concept (see Part 3) |

---

# PART 1 — PROJECT OVERVIEW (Revised)

## 1.1 What MedZ Is Now

MedZ is a self-authored, curriculum-aligned medical education platform for Egyptian medical students. Its core function is unchanged in spirit — close the gap between attending a lecture and actually retaining the material — but the content no longer depends on any single professor's cooperation. MedZ itself builds and owns the question bank and flashcard library, organized by the real structure of the Egyptian integrated curriculum: Modules containing Subjects, Subjects containing Chapters.

## 1.2 The Problem It Solves (unchanged, still the foundation)

Three structural failures still define medical education in Egypt: no immediate recall loop after lectures, curriculum misalignment with Western platforms (UWorld, Amboss, Osmosis), and no visibility into per-topic weak areas. What's changed is *who* fixes the fourth failure — "professor content is inaccessible" is no longer solved by convincing individual professors to digitize their notes. MedZ solves it directly by building the bank itself, sourced from professor-authored MCQ books and files, reviewed by trusted graduate students before publishing.

## 1.3 The Two User Types (Professor removed)

| User | What They Do | Why They Care |
|---|---|---|
| Student | Takes MCQ challenges and custom exams, tracks streaks, adds friends, competes on leaderboard, bookmarks/reviews questions | Know weak areas before exams, stay motivated, study socially |
| Admin (Zoz + Ammar only) | Builds and manages the Module/Subject/Chapter taxonomy, enters and publishes MCQs, manages users and platform analytics | Full control over content quality and platform growth |

There is no Professor role in v2.0, and — confirmed 2026-08-07 — **no Reviewer role either.** The two graduate-student reviewers validate source content entirely offline, before anything reaches the platform; they never get a MedZ account or dashboard access. Admin (Zoz + Ammar) are the only platform users besides Student. The "Post-Lecture" real-time challenge feature (Kahoot-style) requires professor cooperation MedZ doesn't currently have, and is removed entirely for now rather than teased — see Part 1.5.

## 1.4 The Core Platform Loop (Revised)

1. Admin (Zoz/Ammar) creates a Module, assigns existing or new Subjects to it, and defines Chapters within each Subject.
2. One of the two graduate-student reviewers checks a source MCQ book/file for accuracy — entirely offline, outside the platform — before it's ever uploaded.
3. Once a source is reviewer-approved, Admin (Zoz/Ammar) uploads it to the Admin Dashboard; AI-assisted extraction turns it into structured draft questions, which Admin tags to the right Chapter, attaches a reference (book + page), and publishes.
4. Student logs in, picks a Module → Subject → Chapter (or takes the default full-subject challenge), and completes a fullscreen MCQ challenge.
5. Split-view results show corrected answers with the reference page pulled automatically from the source book.
6. Student dashboard updates: streak, friend streaks, leaderboard position, per-chapter accuracy.
7. "Quiz on Mistakes" re-tests only what the student got wrong, at any level of the taxonomy (chapter, subject, or module).

## 1.5 A Note on "Coming Soon" Features and Honesty in Roadmapping

**Post-Lecture and AI Tutor are both removed entirely for now (founder decisions, 2026-08-06 and 2026-08-07).** Post-Lecture requires a professor actively running it live in their own classroom — without a professor deal, there's no way to keep up with every lecture across every subject, so the feature simply doesn't work standalone. Neither feature is shown as "Coming Soon," neither is on the roadmap, and neither has any in-UI tease. Both are dormant product ideas to revisit fresh later if a professor relationship re-emerges (Post-Lecture) or the AI cost/design work gets prioritized (AI Tutor) — not placeholders sitting in the current build.

---

# PART 2 — PRODUCT SPECIFICATION (Revised)

## 2.1 Opening Screen — Unchanged

Splash screen, MedZ logo, "Master Medicine. Smarter. Faster." tagline, routes to login/signup.

## 2.2 Authentication Flow — Simplified

Signup collects name, email, password, and now a **username** (required, unique — needed for the friends/leaderboard system). Role field is removed from signup; every account is a Student by default. Admin accounts are provisioned manually (not self-service) since there's no public professor signup path anymore.

- All users → `/student/subjects`
- Admin accounts (manually flagged) → `/admin/dashboard`

## 2.3 Student Experience

### Subjects / Home Page — Redesigned Hero (see Part 3 for full design rationale)

The Dr. Zahra hero is gone. Replacement concept: lead with the student's own progress and streak state front-and-center on login (a personalized "Welcome back — 4 day streak, 2 friends ahead of you on the leaderboard" hero), with Module selection as the primary navigation below it. This shifts the trust signal from "an authority endorses this" to "this already knows me and my classmates are on it" — which is a more honest trust story for a self-authored, socially-driven product anyway.

### Module → Subject → Chapter Selection

Replaces the old flat subject carousel. Student picks a **Module** first (e.g., "Module 103"). The page then shows the Subjects that belong to that Module (via the `module_subjects` join — a Subject like Anatomy can appear under multiple Modules but is the same underlying content). Within a chosen Subject, Chapters are listed for selection. A student can:

- Take a full-subject challenge (all chapters in that subject, within the current module context)
- Take a single-chapter challenge
- Build a **Custom Exam**: pick a Module → pick one or more Subjects within it → pick one or more Chapters within each → generate a mixed exam from exactly that scope

### Quiz Engine — Fullscreen Mode (unchanged from v1)

Fullscreen API, four choices, progress bar, copy/paste disabled, tab-switch detection, three violations force-end the session. This anti-cheat system carries over unmodified.

### Quiz Engine — Split View Mode (Reference system upgraded)

After submitting: left panel shows corrected question (emerald = correct, crimson = wrong, per-choice explanations). Right panel: Explanation tab + **Reference tab**. The Reference tab no longer relies on a manual per-question screenshot — it pulls a pre-digitized page image from the source book, keyed by `book_id + page_number` attached to that question (see Part 5 for the full mechanism).

### In-Quiz Tools — Unchanged

Bookmark, Notes (rich text), Copy, Exit + Resume.

### Quiz on Mistakes — Now Taxonomy-Aware

Can be scoped at chapter, subject, or module level, not just per-subject as in v1.

### Streaks, Friend Streaks & Notifications — New

- **Daily Streak**: unchanged mechanic from v1 (`daily_streaks` table), increments on any completed challenge.
- **Streak Commitment (founder decision, 2026-08-06)**: when a student starts a new streak (i.e., a streak restarts from zero), they pick a target length — 7 / 14 / 30 days — and the UI tracks visible progress toward that specific goal, not just an open-ended counter. Defaults to a 7-day goal if the student skips the choice, to keep it frictionless. Hitting the target awards a visible badge on profile and leaderboard — **no functional unlock**, flair only, per your decision. No streak-freeze safety net for this launch (also your call) — missing a day resets the streak to zero and marks any in-progress commitment as failed; revisit adding a freeze later if retention data shows it's needed.
- **Friend Streaks**: a shared streak between two students who are mutual friends, both need to complete at least one challenge on a given day to keep the shared streak alive — mirrors Snapchat-style social streak mechanics, which is a genuinely strong retention lever for a study app aimed at a tight-knit student cohort. The same goal-commitment and badge mechanic applies to friend streaks as personal ones.
- **Usernames & Friends**: every student chooses a unique username at account creation; students search by username to send/accept friend requests, which is what unlocks starting a friend streak with them.
- **Email Notifications**: a scheduled job checks for students at risk of losing a streak (no activity by a cutoff time) and sends a reminder email. Requires adding a transactional email provider to the stack — not currently present (see Part 4.1 stack additions).

### Leaderboard — New

**One global leaderboard** across all students (founder decision, 2026-08-07) — not scoped per module. Shows the student's current rank plus the top 10. Ranking is by a **composite XP score** (points awarded per correct answer, Duolingo-style), not raw correct-answer count or accuracy alone — this avoids two known gaming problems: raw counts reward volume-grinding over careful study, and pure accuracy % lets someone rank #1 by only ever attempting questions they're already sure of. Backed by a materialized view or scheduled aggregation job, not a live per-request calculation.

### Flashcards — Phase 2 (Deprioritized, confirmed by founders)

Same view/flip/bookmark interaction as MCQs but with no right/wrong scoring. Tagged to the same Chapter taxonomy as MCQs. Explicitly not part of the initial launch.

## 2.4 Admin Dashboard — Now the Entire Content Operation

This replaces both the old Professor Dashboard and Admin Dashboard with a single, more powerful control panel. **Only Zoz and Ammar have access to it.**

Seven sections:

**1. Overview** — platform-wide KPIs (users, questions published, DAU), Daily Active Users chart, and a unified **Activity Log** — a real feed of everything happening on the platform: new signups, questions published or edited, users suspended/removed, anti-cheat violations logged, streak milestones hit. Filterable by type and date.

**2. Taxonomy Management** — Create/edit Modules (name, code, academic year/term). Assign existing Subjects to a Module, or create a new Subject and assign it (Subjects are global — created once, reused across Modules). Create/edit Chapters within a Subject and Module (Chapters belong to exactly one Subject *and* one Module, never duplicated).

**3. Content Library** — A single searchable, filterable table of *every* question regardless of status (draft, under review, published, archived), filterable by Module/Subject/Chapter/status and searchable by keyword. Every question — including already-published, live ones — is directly editable from here. Edits to a published question go live immediately (no re-review step) but are logged with a visible **edit history** (what changed, when, by whom). Supports bulk actions (bulk publish, bulk re-tag, bulk archive).

**4. Review Queue** — AI-extracted draft questions awaiting Admin approval before first publish.

**5. Content Upload** — upload reviewer-approved MCQ books/files (PDF or image); triggers the AI-assisted extraction pipeline into the Review Queue (Part 5).

**6. Manual MCQ Entry** — direct form entry for any question not sourced from a scanned file: question text, up to 5 choices, correct answer, explanation, and reference (book + page, autocompletes from the chapter's default source).

**7. User Management** — user table, search/filter, suspend/remove with confirmation modal (cannot delete self), platform-wide user KPIs.

**Explicitly deferred/decided against:** a student-facing "report this question" flow (Phase 2). Per-student activity drill-in (decided against, not deferred — Admin visibility stays aggregate-only). Retroactive student notification when a published question is corrected (not built — fix applies going forward only).

## 2.5 Coming Soon Features (Revised)

| Feature | Location | Planned Phase |
|---|---|---|
| Flashcards | Student dashboard / Admin | Phase 2 — stays visible as "Coming Soon" |
| Arabic RTL | Platform-wide | Phase 4 |
| Mobile App | iOS + Android | Phase 5 |

AI Tutor and Post-Lecture are both removed entirely — neither is tracked as "Coming Soon." Flashcards is the only feature still shown as a live tease.

---

# PART 3 — DESIGN SYSTEM (Revised)

## 3.1 What Carries Over Unchanged

Color palette, typography, layout system, spacing, radius, and transition rules — the "premium, dark, $50M product" visual language doesn't need to change because the business model did.

## 3.2 What Must Change: The Hero / Trust Signal

The v1.0 Subjects page hero was built entirely around Dr. Ahmed Zahra (photo, gold badge, "10,000+ Students"). That's gone and must not be left empty or faked. Replace with:

- **Personalized state, not a mascot**: on login, the hero shows the student's own streak, rank, and friends' activity.
- **Social proof at the aggregate level**: platform-wide numbers once available ("2,400 students preparing for [Module] this month").
- **Content provenance, understated**: a small "reviewed by [names/credentials]" trust line.

This is a genuine design task, not a copy-paste swap.

## 3.3 Subject Visuals — Unchanged

Higgsfield-generated subject imagery carries over as-is.

---

# PART 4 — TECHNICAL ARCHITECTURE (Revised)

> **IMPORTANT — read this before touching the schema.** The tables below describe the *product* schema as originally specified. The actual implemented schema (in `supabase/migrations/`, especially `015_b2c_pivot_rebuild.sql` and `016_admin_activity_log.sql`) uses different column/PK names in a few places for compatibility with the pre-existing v1.0 tables it was migrated on top of. **The migrations are the source of truth for exact column names — this doc is the source of truth for product behavior.** Known naming differences:
> - `modules.code` (TEXT, PK) — not a separate `id UUID`. No `academic_year`/`order_index` columns; equivalent fields are `year_num`/`year_label`, and there's no explicit order column (sort by `code`).
> - `chapters.module_code` (TEXT, FK → `modules.code`) — not `module_id`.
> - `questions.professor_id` — legacy column name from the v1.0 schema, kept as-is rather than renamed. Post-pivot it always holds an Admin's user id (Zoz or Ammar), functionally equivalent to this doc's `created_by`. Don't be confused by the name; don't add a new `created_by` column, just use `professor_id`.
> - `questions.reference` (TEXT) — a free-text legacy reference field, kept alongside the new `reference_book_id`/`reference_page` columns rather than removed.
> - `questions.id` is `BIGSERIAL` (integer), not UUID. `questions.subject_id`/`subject_bundle_id` (legacy TEXT/INTEGER columns from v1.0, `UNIQUE(subject_id, subject_bundle_id)`) still exist and must still be populated on every insert even though the real taxonomy scope is `chapter_id` — see the "legacy columns" note in `app/api/admin/questions/route.ts`.
> - There is no separate `leaderboard_snapshot` table yet — `profiles.total_xp` exists (015) but the materialized ranking view/job described below has **not been built** (part of task: B2C social features).
> - `friends`/`friend_streaks`/`streak_commitments`/`badges`/`reference_books`/`reference_pages` **do** match this doc's shape — those were net-new tables with no v1.0 legacy to reconcile against.

## 4.1 Tech Stack — Additions

| Addition | Purpose |
|---|---|
| AI Vision Model (Claude Haiku or GPT-4o-mini class) | Replaces/augments Tesseract.js+regex for MCQ extraction from scanned source files — see Part 5. **Not yet built** — Content Upload currently still runs the old pdf-parse+regex / Tesseract OCR fallback pipeline (`app/api/admin/upload/route.ts`, `lib/pdf-extract.ts`, `lib/ocr/*`), which works but is not what Part 5.5 specifies. |
| Transactional email provider (e.g. Resend) | Streak-loss reminder emails — not present in stack yet |
| Book page image store | Pre-digitized reference book pages — `reference_books`/`reference_pages` tables exist (015), digitization pipeline not yet built |

## 4.2 Database Schema — Core Changes

See the naming-differences callout above. Conceptually: Modules → (many-to-many via `module_subjects`) → Subjects → Chapters (scoped to one Module + one Subject each, never shared) → Questions (`chapter_id` FK). Full column-level detail is in the migrations, not reproduced here since the migrations are authoritative.

**Why chapters are scoped to (Module, Subject) and not Subject alone:** the same Subject reappears across Modules with entirely different, non-overlapping chapters — Histology's chapters under Module 101 (Cytology, Connective Tissue, Epithelium, Blood) share nothing with Module 103's Histology chapters (Cartilage, Bone, Muscle, Skin). A chapter scoped only to a Subject would incorrectly merge these.

## 4.3 API Route Map

Implemented (see `app/api/admin/*`, all admin-gated via `profiles.role = 'admin'`):
`/api/admin/modules` (GET/POST), `/api/admin/modules/[code]` (PATCH), `/api/admin/modules/[code]/subjects` (GET/POST/DELETE), `/api/admin/subjects` (GET/POST), `/api/admin/chapters` (GET/POST), `/api/admin/chapters/[id]` (PATCH/DELETE), `/api/admin/questions` (GET/POST — Content Library + Review Queue share this endpoint, filtered by `status`), `/api/admin/questions/[id]` (PATCH/DELETE-as-archive), `/api/admin/questions/[id]/history` (GET — edit history), `/api/admin/questions/bulk` (POST), `/api/admin/upload` (POST — Content Upload), `/api/admin/activity` (GET — Overview feed), `/api/admin/overview` (GET — KPIs), `/api/admin/remove-user` (POST, pre-existing). Public read: `/api/modules` (GET — full taxonomy with subjects/chapters, any signed-in user).

**Not yet implemented** (student-facing, all of task "B2C social features" and "Custom Exam builder"):
`/api/student/custom-exam`, `/api/student/friends`, `/api/student/leaderboard`, `/api/cron/streak-reminder`.

## 4.4 Confirmed Module Taxonomy — Year 1 & Year 2

Already seeded by `015_b2c_pivot_rebuild.sql` — this is DONE, don't re-seed or duplicate.

**Year 1**

| Module | Subjects | Chapters given |
|---|---|---|
| 101 | Anatomy, Histology | Histology: Cytology, Connective Tissue, Epithelium, Blood. Anatomy: placeholder ×3 |
| 102 | Physiology, Biochemistry | Both: placeholder ×3 |
| 103 | Anatomy, Histology, Biochemistry, Physiology | Histology: Cartilage, Bone, Muscle, Skin. Others: placeholder ×3 each |
| 104 | Anatomy, Histology, Physiology | Histology: Lymphatics, Vascular, Respiratory, Cytogenetics. Others: placeholder ×3 each |
| 108 | Pharmacology, Pathology | Both: placeholder ×3 |

**Year 2**

| Module | Subjects | Chapters given |
|---|---|---|
| 205 | Anatomy, Physiology, Histology | Anatomy: Neuroanatomy, Head, Neck. Physiology: Sensory/Motor Nervous System, Special Senses. Histology: placeholder ×3 (not given in founder data — verify before assuming) |
| 206 | Anatomy, Physiology, Histology, Biochemistry | Anatomy/Physiology/Histology: Digestive Tract, Digestive Glands, Urinary System. Biochemistry: placeholder ×3 |
| 207 | Anatomy, Histology, Physiology | Histology: Endocrine System, Male Reproductive System, Female Reproductive System (the 11 seed questions live here). Anatomy/Physiology: placeholder ×3 each |
| 208 | Pathology, Pharmacology | Both: placeholder ×3 |

Module codes encode academic year in the leading digit (101-108 = Year 1, 205-208 = Year 2).

---

# PART 5 — CONTENT PIPELINE & REFERENCE SYSTEM

## 5.1 The Review Workflow

The two graduate-student reviewers work entirely offline — no platform access, no Reviewer role. Admin (Zoz + Ammar) are the only platform users who touch content once it enters the system. Flow: offline accuracy check → Admin uploads via Content Upload → pages converted to images → extraction (currently pdf-parse+regex / Tesseract OCR fallback, not yet the VLM pipeline below) → lands in Review Queue → Admin corrects, tags to Chapter, sets reference, publishes.

## 5.2 The Reference-by-Page System

Digitize each source book **once** into `reference_pages` (keyed by `book_id` + `page_number`). Chapter-level default (`chapters.default_book_id`/`default_page_start`) speeds up batch entry; per-question override (`questions.reference_book_id`/`reference_page`) for precision. **Schema exists (015); the actual book-digitization pipeline (upload a book → rasterize every page → populate `reference_pages`) has not been built yet.**

## 5.3 Copyright — Resolved for Module Manuals

Each Module's reference book is a faculty/department-produced manual, freely distributable to enrolled students — confirmed by founders. Full-page digitization is fine. Track provenance per book as hygiene for any future non-module-manual source.

## 5.4 AI Cost Estimate

Directional only, verify with a real test batch: ~$0.003–$0.01 per page with a low-cost vision model (Claude Haiku 4.5 / GPT-4o-mini class), ~$30–$100 total at 10,000 pages.

## 5.5 VLM Extraction — Build Specification

**Not yet built — this is task "Replace OCR pipeline with VLM-based extraction."** Current `/api/admin/upload` uses the old pdf-parse+regex/Tesseract pipeline, which works and should stay wired up as a fallback per Part 4.1, but is not this spec.

Model selection is a build step (test Claude Haiku vs GPT-4o-mini on an identical 50-page batch before committing, keep the loser as a documented fallback). Per-page extraction call returns strict JSON:

```json
{
  "printed_page_number": 42,
  "questions": [
    {
      "question_text": "...",
      "choices": [{ "id": "a", "text": "..." }],
      "correct_answer": "a",
      "explanation": "...",
      "confidence": 0.92,
      "is_partial_start": false,
      "is_partial_continuation": false
    }
  ]
}
```

Key requirements: (1) the model must read and return the page number **printed on the page** (header/footer), not the file's internal page index — this becomes `reference_page`. (2) Pages processed **sequentially, not in parallel**, so a cross-page stitching pass can merge `is_partial_start` (page N) with `is_partial_continuation` (page N+1) into one complete question before it reaches the Review Queue — partial fragments are never shown to Admin. (3) No confidence auto-rejection — everything lands in the Review Queue with its score visible, sorted so Admin can prioritize low-confidence items.

---

# PART 6 — SECURITY MODEL

Server-side route protection (every admin route checks `profiles.role = 'admin'` in addition to RLS), RLS on every table, Zod validation on every write, rate limiting (`lib/rate-limit.ts` — `adminLimiter`, `uploadLimiter`, etc.), the existing anti-cheat system (fullscreen, tab-switch detection, violation logging), role-elevation prevention trigger (`013_role_immutability.sql`). RLS on `friends`/`friend_streaks`/`badges` needs the read-broadly-write-your-own pattern once the friends system is built (task: B2C social features) — not yet implemented.

---

# PART 7 — SCALING & PART 8 — INFRASTRUCTURE

Unchanged from v1.0: connection pooling, DB indexes, Redis caching (Upstash), rate limiting, table partitioning (`quiz_sessions` is already partitioned by month, see `005_performance_indexes.sql`), DigitalOcean deployment. Not pivot-affected.

---

# PART 9 — BUSINESS CASE

## 9.1–9.4 Summary

500,000+ medical students in Egypt, zero curriculum-aligned platform. Acquisition: Ammar's ~360-member Telegram community (built on free flashcards), pre-launch social teasers, medical-influencer network. Open tension: that community's proven appetite is flashcards specifically, while Phase 1 ships MCQ-only — whether to pull a small flashcard set forward as a launch hook is an open founder call. Free at launch, monetize later once usage data exists. Instrument signup source (referral/UTM per channel) and usage data (DAU, streak retention, chapter completion) from day one.

## 9.5 Roadmap

| Phase | Deliverables |
|---|---|
| **Phase 1 — Summer Launch** | Admin Dashboard live (**backend done**, frontend not started), all Year 1/2 modules content-complete, core quiz engine (exists from v1.0), streaks/usernames/friends/leaderboard (**not built**), Custom Exam builder (**not built**) |
| **Phase 2 — Full Catalog** | Every module content-complete, flashcards live, friend streaks + email notifications, reference-by-page system fully populated, VLM extraction pipeline |
| **Phase 3 — Expand** | GTM execution, monetization decided from usage data |
| **Phase 4 — Platform** | Arabic RTL, mobile app |

---

# PART 10 — REMAINING BUILD WORK

This is the actual task list as of this handoff. Work through these in order — each depends on the schema/backend already in place from earlier commits.

## Already done (don't redo, don't regress)

- **Schema rebuild** (`015_b2c_pivot_rebuild.sql`, `016_admin_activity_log.sql`): multi-subject taxonomy, admin-only RLS everywhere, `friends`/`friend_streaks`/`streak_commitments`/`badges`/`reference_books`/`reference_pages`/`activity_log` tables, `profiles.username`/`total_xp` columns, the 11 seed Histology questions reattached to Module 207's correct chapters.
- **Professor architecture fully removed**: no Professor role, no `app/(professor)/*`, no `/api/professor/*`. `profiles.role` CHECK is `('student', 'admin')` only. Don't reintroduce a Professor role or reference `role === 'professor'` anywhere.
- **AI Tutor removed entirely** — no component, no "Coming Soon" tease anywhere (quiz page, landing page, nav). Don't re-add it without an explicit founder decision to un-defer it (see Part 1.5).
- **Post-Lecture removed entirely** — same rule. Needs a professor deal that doesn't exist.
- **Admin Dashboard backend** (all 7 sections' API routes exist and are wired to the real schema): taxonomy CRUD, Content Library + Review Queue (shared `/api/admin/questions` endpoint), Manual MCQ Entry, bulk actions, Content Upload (old-but-working extraction pipeline), Activity Log, Overview KPIs. Every write is Zod-validated and admin-role-gated. Every publish/edit/archive on a question logs to `activity_log` via `logActivity()` in `lib/admin-activity.ts`.

## Known stack gotcha — read before writing more Supabase queries

`SupabaseClient<Database>` (this project pins `@supabase/ssr@^0.12.3` + `@supabase/supabase-js@^2.39.3`) collapses `.from(table).update(...)`/`.insert(...)` argument types to `never` for most tables, regardless of whether the table is declared in `lib/supabase.ts`'s `Database` type. This is a pre-existing limitation of this exact dependency combination — not something a "more correct" type definition fixes (confirmed by trial: extending the `Database` type did not resolve it).

**The fix, used everywhere in this codebase**: `import { untypedFrom } from '@/lib/supabase-server'`, then use `untypedFrom(supabase).from('table')...` instead of `supabase.from('table')...` for every query. Keep `supabase.auth.getUser()` and other non-`.from()` calls on the typed client as normal.

Two related gotchas that cost real debugging time — watch for both:
1. **Multi-line chains.** `supabase\n  .from('table')` (the dominant style in this codebase) needs the same fix as single-line `supabase.from('table')` — don't assume a regex or find-replace targeting only same-line patterns catches everything.
2. **Casting inside a `.map()` callback doesn't help.** `data.map((r) => (r as T).id)` still trips `noImplicitAny` on the callback parameter even though the cast is right there — the array itself needs the cast, before `.map()`: `(data as T[]).map((r) => r.id)`.

**Verification discipline**: this sandbox cannot run `npm install`/`npm run build` reliably (no persistent background processes between tool calls). Every fix above was found by the user running `npm run build` locally and pasting the actual compiler output — that loop is the only reliable way to verify TypeScript correctness on this project. Run `npm run build` after every meaningful change, not just at the end of a large batch — fix one error, rebuild, repeat. Don't write more than one or two files' worth of new Supabase-touching code without a build check in between.

## Remaining tasks, in priority order

### 1. Admin Dashboard frontend (Part 2.4)

`app/(admin)/admin/dashboard/page.tsx` is still the old ~1,700-line pre-pivot file — it hasn't been touched yet and still references removed concepts (a `ProfessorActivityPanel`, single-subject `SubjectManagementPanel`). The backend above is ready for it. Rebuild the page around the 7 sections, reusing the existing generic primitives already in that file where they still make sense (`Header`, `TopNav`, `SideNav`, `StatCard`, `Toggle`, `ConfirmModal`, `ToastStack`, `FadeUp`, `ActionButton`) rather than rewriting those from scratch. Remove `ProfessorActivityPanel` entirely. Rework `SubjectManagementPanel` into a proper Taxonomy Management panel that understands the multi-subject-per-module model (a Module has several Subjects via `module_subjects`, each with its own Chapters) — the old panel assumed one subject per module and will produce wrong UI if reused as-is.

### 2. B2C social features (Part 2.3: Usernames & Friends, Streaks, Friend Streaks, Leaderboard)

Nothing built yet beyond the schema. Needs: `/api/student/friends` (request/accept/decline, search by username), `/api/student/leaderboard` (rank + top 10 from `profiles.total_xp` — build the ranking query before building the materialized-view optimization; optimize later if it's actually slow), streak-commitment goal-picking UI wired to `streak_commitments`, badge award logic on commitment completion, friend-streak shared-completion logic. XP increment on correct answer needs to be added to the existing quiz-submit flow (find wherever `quiz_sessions` currently gets written and add a `profiles.total_xp` increment there). Streak-loss email cron (`/api/cron/streak-reminder`) needs a transactional email provider added to the stack first (Part 4.1) — flag this as a dependency, don't block the rest of the streak UI on it.

### 3. Custom Exam builder (Part 2.3)

Student-facing Module → Subject → Chapter multi-select, generates a mixed exam from the selected scope. `/api/student/custom-exam` doesn't exist yet. Also note from the schema work: the existing student-facing subjects/modules/chapters browsing pages (`app/(student)/student/subjects/**`) are still hardcoded to a single static Histology-only catalog (`data/histology-catalog.ts`) and don't reflect the real multi-subject taxonomy at all — the public `/api/modules` endpoint already returns the correct multi-subject shape, but nothing in the UI consumes it that way yet. This task likely needs to replace that static catalog with something DB-driven, not just add a picker on top of it.

### 4. VLM extraction pipeline (Part 5.5)

Replaces the current pdf-parse+regex/Tesseract pipeline in `app/api/admin/upload/route.ts`. Model-selection test batch first (Part 5.5), then the structured-JSON extraction + cross-page stitching pass. Keep the existing pipeline working as the Part 4.1-specified fallback rather than deleting it outright.

### 5. Flashcards (Phase 2, lowest priority)

Schema not yet added (would follow the same pattern as `reference_books`/`reference_pages` — a new migration). Admin entry form + student flip/bookmark UI. Explicitly not launch-blocking per the roadmap (Part 9.5) — don't prioritize this over 1-4 above without an explicit founder decision to pull it forward (see Part 9.2's open tension about the Telegram community's flashcard appetite).

## General conventions established so far — follow these for consistency

- Every admin route: `profiles.role === 'admin'` check via a `requireAdmin(supabase)` helper (duplicated per-file rather than centralized — fine to keep doing this, or centralize it into a shared lib if it gets unwieldy, your call).
- Every write: Zod schema validation before touching the database.
- Every question status change (create/edit/publish/archive) and every taxonomy edit: `logActivity(supabase, {...})` from `lib/admin-activity.ts` — this feeds both the Overview Activity Log and Content Library's per-question edit history from one table.
- Soft-delete, not hard delete, for questions: `status = 'archived'`, never a real `DELETE FROM questions`.
- Chapters: refuse to hard-delete a non-empty chapter (`question_count > 0`) — re-tag or archive its questions first.
- Cache invalidation: any publish/archive/edit-while-published on a question calls `invalidateCache(CACHE_KEYS.subjectList(), CACHE_KEYS.questionBank(subjectSlug))`.
