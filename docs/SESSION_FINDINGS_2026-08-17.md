# Session findings — 2026-08-17 debugging pass

Context notes from a full build/lint/test hardening pass on `Testing`, worth keeping outside the chat transcript that produced them.

## Branch context — read this first

`Testing` (this branch) does not include the B2C pivot that exists on `b2c-pivot-rebuild`. That branch's founder handoff doc (`git show 8f13ce0:CLAUDE.md` on `b2c-pivot-rebuild`) explicitly documents the Professor role, Post-Lecture Challenges, and AI Tutor as **deliberately removed — "leftover debt to clean up, not a feature to preserve"** if found on any other branch, pending an explicit founder decision to keep them.

Everything below that touches the professor-role surface was fixed *on Testing* this session per explicit instruction to continue here regardless — it's interim work, not something to carry forward into a pivot merge.

## Missing production schema (not a bug — a completeness gap)

Checked all 15 Supabase migrations. Full table list: `profiles`, `questions`, `violations`, `jobs`, `quiz_sessions` (+ partitions), `daily_streaks`, `bookmarks`, `notes`, `modules`, `chapters`, `upload_jobs`, `question_flags`. Three demo-mode-only features have **no backing table at all**, not just missing RLS scoping:

- Mock exams (`MockExamsPanel.tsx` → `medz.professor.exams.v1` in `localStorage`)
- Post-lecture challenges (`PostLecturePanel.tsx` / student challenges page → `medz.professor.challenges.v1`)
- Chapter progress (`lib/chapter-progress.ts` → `medz_chapter_progress_v1`)

By contrast, quiz answers/bookmarks/notes (`lib/store.ts`'s Zustand `persist`) *do* have a correctly `auth.uid()`-scoped production equivalent (`quiz_sessions`, `bookmarks`, `notes` tables) — demo mode there is a genuine, inert simplification. The three above are not; they have nothing to diverge from yet.

## `markComplete` / chapter completion — unreachable end-to-end

`useChapterProgressActions().markComplete` (`lib/chapter-progress.ts`) is exported but has zero callers anywhere in the codebase. Its sibling `reset` is called once, from `ChapterRow.solveAgain()` in `app/(student)/student/subjects/[subjectId]/[moduleCode]/page.tsx` — but that whole interactive branch is gated behind `chapter.published === true`, and every chapter in the static catalog (`data/histology-catalog.ts`) seeds `published: false` with no UI path to flip it. The mechanism was verified directly (write-through-localStorage + dispatch the change event), but the real completion flow has no live entry point today.

## `components/dashboard/Analytics.tsx` — dead code, unrelated to the pivot

Zero references anywhere in the repo, including no `dynamic()` import despite its own comment describing one. Not professor-gated — it's generic student-facing accuracy charting (Recharts) that was apparently built and never wired to a parent page. Fixed its lint finding in place since it was trivial, but it still renders nowhere.

## Real bugs found and fixed this session (see commit for the diff)

- **MockExamsPanel module-toggle snap-back**: deselecting the last selected module let a `useEffect` silently re-select it with no feedback. Fixed with `aria-disabled` + guarded click + `aria-describedby`, not a `disabled` attribute (keeps it keyboard-reachable).
- **NotesEditor data loss on close**: the debounced (350ms) note autosave was cancelled, not flushed, on unmount — closing the notes panel (or, after the fix, navigating questions) within the debounce window silently discarded whatever was just typed. Fixed with a flush-on-unmount ref pair; verified with a same-tick type+close script to force the race.
- **Login demo-profile carryover** (`app/(auth)/login/page.tsx`): `full_name` and `id` were reused from any existing demo profile regardless of whether the email matched — `role` had the correct `existing.email === email` guard, the other two fields didn't. Switching accounts in the same browser without clearing storage inherited the previous account's name and id. Both fields now match `role`'s guard.
- **Post-lecture challenges key mismatch**: `PostLecturePanel.tsx` (professor, write side) and the student challenges page (read side) used two different `localStorage` keys (`medz.professor.challenges.v1` vs `medz.postLectureChallenges`), despite a comment claiming they matched. Professor-authored challenges never reached students. Fixed by pointing the student side at the professor-write key.

## Lint-debt pass

Started at 27 errors / 10 warnings (undercounted at first — see below), ended at 0 errors / 0 warnings across the full repo. Every `react-hooks/set-state-in-effect` and `react-hooks/purity` finding was re-derived per instance rather than pattern-matched by rule name — most were legitimate SSR-hydration-safety effects or genuine external-system subscriptions and got documented suppressions; three (`NotesEditor.tsx`, `app/(auth)/login/page.tsx`'s `missing_profile` effect) had real fixes available (key-based remount, lazy `useState` initializer) and got those instead of a suppression.

Worth flagging for calibration: the original count of "27 errors" was itself wrong twice over — a `tail -200` truncation silently dropped 4 files from view, and a further 4 files that *were* visible didn't make it into the written summary. Corrected before the file-by-file pass began; see chat history for the full audit if it matters later.

## Dr. Zahra profile cleanup — questions content backup (before deletion)

Preserved here before the 11 rows (`questions.id 12–22`) are deleted from the live `meds-demo` project, per instruction. All 11 came from one upload job (`upload_jobs`, completed 2026-07-22 21:02, source file `DemoQuestions.pdf`) — an early test of the upload pipeline, not reviewed/real curriculum content. All were attached to module `104` / chapter `Vascular` regardless of actual subject matter (mistagged — see subject matter below). Question `id 22` was live with `status = 'published'` until this session archived it (see chat).

Includes full question text plus choices/correct answer/explanation (beyond the id/module/chapter/text originally asked for, since it costs nothing extra and is a more complete backup — flagging in case only the narrower set was wanted).

### id 12 — under_review
**Q:** Cowper's glands are characterized by:
- a. Provides 65% - 75% of seminal fluid
- b. Their duct joins the membranous part of the urethra
- c. They neutralize any traces of acidic urine
- d. Their secretion is rich in fibrinolysin

**Correct:** c
**Explanation:** Cowper's (Bulbo-urethral) glands produce clear mucus secretion that serves to lubricate penile urethra & neutralize any traces of acidic urine.

### id 13 — under_review
**Q:** Which of the following characterizes the mature Graafian follicle?
- a. Theca interna cells can differentiate into smooth muscle cells
- b. Gap junctions are present in the perivitelline space
- c. Corona radiata is a single layer of flat cells
- d. Theca externa secrete androgen

**Correct:** b
**Explanation:** In the mature Graafian follicle, the corona radiata cells send cytoplasmic processes that penetrate zona pellucida to make contact with microvilli projecting from the oocyte via gap junctions in the perivitelline space to allow passage of ions, metabolites & other substances to oocyte.

### id 14 — under_review
**Q:** The following is a characteristic feature of Pars nervosa:
- a. Formed of groups of secretory cells separated by fenestrated capillaries
- b. Has accumulated neurosecretion called Herring bodies
- c. Pinealocyte are branched supporting cells
- d. Herring bodies are nerve cells, which accumulates neurosecretion

**Correct:** b
**Explanation:** Pars nervosa structure includes: Pituicytes, Nerve fibers, Herring bodies (= acidophilic bodies) which are accumulated neurosecretion in axon terminals of nerve fibers, and fenestrated blood capillaries.

### id 15 — under_review
**Q:** Regarding pineal body:
- a. Pinealocytes are innervated by myelinated nerve fibers
- b. Psammoma bodies are considered as land mark in brain x-ray
- c. Derived from mesoderm
- d. Pinealocytes are rich in SER & lipid droplets

**Correct:** b
**Explanation:** Brain sand (psammoma bodies, corpora aranacea) are calcified concretions (calcified secretory products in concentric layers) which increase with age and serve as a landmark in X-ray to localize any mass in the brain which may displace its position.

### id 16 — under_review
**Q (garbled — OCR/extraction artifact, question stem is just "a."):** a.

Original question was evidently "Which of the following accurately describes the Sertoli cells?" (recoverable from a choice-text fragment) with choices:
- a. Have well defined lateral borders
- b. (garbled, see explanation) — large polygonal cells with acidophilic cytoplasm containing lipid droplets = Leydig cells, not Sertoli
- c. Polygonal cells with few lipid droplets / Have deeply acidophilic cytoplasm (choices garbled together)
- d. Phagocytose residual bodies

**Correct:** d
**Explanation:** Sertoli cells have lysosomes responsible for phagocytosis of residual bodies (shed during spermiogenesis) and degenerated spermatogenic cells. a. WRONG — Sertoli cells have ill-defined cell boundaries. b. WRONG — describes Leydig cells, not Sertoli. c. WRONG — Sertoli cells have pale acidophilic cytoplasm, not deeply acidophilic. d. CORRECT.

### id 17 — under_review
**Q:** Which of the following have features of steroid-forming cells?

Choices garbled by the same extraction issue as id 16 — recoverable set: Spongiocytes / Somatotrophs / Chromaffin cells / Carminophils.

**Correct:** a (Spongiocytes)
**Explanation:** Spongiocytes are cells of Zona Fasciculata of the adrenal cortex, rich in mitochondria, Golgi apparatus, sER, and fat droplets — characteristic of steroid-secreting cells. Somatotrophs (b) secrete GH (protein hormone). Chromaffin cells (c) secrete catecholamines. Carminophils/Mammotrophs (d) secrete prolactin (protein hormone) — none have steroid-secreting features.

### id 18 — under_review
**Q:** In resting state of breast, which of the followings is true?

Choices garbled by the same extraction issue — recoverable set: Thick dense connective tissue septa / Fewer amounts of fat cells / Each lobule consists of ducts and alveoli / Milk appears as vacuolated acidophilic secretion.

**Correct:** a (Thick dense C.T. septa)
**Explanation:** Resting-state breast is composed of 12-20 lobes separated by thick, dense C.T. septa rich in fat cells. Fewer fat cells (b) is a pregnant/lactating-state feature. Alveoli (c) are absent in resting state, only appearing in pregnancy/lactation. Vacuolated acidophilic milk secretion (d) is also a pregnant/lactating-state feature.

### id 19 — under_review
**Q:** Regarding spongiocytes, the following statement is correct:
- a. Polyhedral cells with basal nuclei arranged in anastomosing cords
- b. Columnar cells with central nuclei arranged in arched groups
- c. Polyhedral cells with central nuclei arranged in fasicles
- d. Columnar cells with basal nuclei arranged in straight cords

**Correct:** c
**Explanation:** Spongiocytes are located in Zona Fasciculata. They are polyhedral cells with central rounded pale vesicular nuclei, arranged in narrow straight cords (fascicles), one or two cells wide, separated by straight fenestrated capillaries.

### id 20 — under_review
**Q:** Corpora cavernosa of the penis is characterized by:

Choices garbled by the same extraction issue — recoverable set: Being ventrally located / Surrounded by more elastic fibers than corpus spongiosum / Covered by thick tunica albuginea / Having penile urethra passing through.

**Correct:** c (Covered by thick tunica albuginea)
**Explanation:** Corpora cavernosa are dorsally located (not ventral — that's corpus spongiosum, through which the penile urethra runs). Corpus spongiosum has more elastic fibers, not corpora cavernosa. Corpora cavernosa are covered by thick tunica albuginea; corpus spongiosum by thin tunica albuginea.

### id 21 — under_review
**Q:** The most susceptible acini for Prostatic cancer are present in:
- a. Peripheral zone
- b. Transitional zone
- c. Central zone
- d. Acini occupying the anterior part of prostate

**Correct:** a
**Explanation:** The Peripheral zone corresponds to the peripheral layer of acini occupying the lateral & posterior part of prostate, comprises 70% of the glandular tissue, and is the most susceptible zone for inflammation (chronic prostatitis) and prostatic cancer.

**Open defect, not yet fixed:** ids 17 and 20 have garbled/merged choice arrays (fragments of multiple choices concatenated into single entries) — same extraction defect as the junk "a." rows (16, 18), just less severe since the question stem itself is intact. Needs a manual fix before these two can be published; left as `under_review` for now.

### id 22 — archived (was published)
**Q:** Who are you
- a. zee
- b. zahra
- c. ammar

**Correct:** a
**Explanation:** because zee is the developer.

(This one is plainly a placeholder/test entry, not real content — included for completeness of the backup, not because it's worth restoring.)

**Deliberately left with `professor_id = NULL`:** unlike ids 12–21 (reassigned to zee@medz.co below), id 22 was *not* reassigned when Dr. Zahra's profile was cleaned up. It went to `NULL` via `questions_professor_id_fkey`'s `ON DELETE SET NULL` when her profile row was deleted. This was a deliberate choice, not a bug or a missed row — it's junk/archived content with no real content to attribute to an owner, so no one was assigned. If this shows up later as "why does this one question have no author while everything else does," this is why.

## Dr. Zahra profile cleanup — upload_jobs backup (before step 5's cascade-delete)

`upload_jobs.professor_id` has `ON DELETE CASCADE` to `profiles(id)`, so deleting Dr. Zahra's profile row deletes these 6 rows automatically with no soft-delete path. Captured here first. Confirmed exactly 6 rows before writing this down (5 `failed`, 1 `processing`), matching the expected count.

**Flagging explicitly: one row never resolved.** The `processing` row (`id fa4bf072-ca3c-4c6a-90e6-6a89e02d33fe`, created 2026-07-22 15:23:56) has `completed_at = NULL` and no terminal status — it's still sitting in `processing` a month later. I don't find an existing "stuck-job/no-timeout" entry elsewhere in this doc to tie it to (checked the full file); this is a standalone observation, not a cross-reference to prior documented work. If a real code-level timeout gap exists in the upload pipeline, it isn't written up here yet — worth a real entry if so, separate from this backup note.

All 6 rows are against module `104`, all reference the same two source files (`Histo Dr Zahra.pdf` notes + one of `Histo MCQ by Dr.Zahra [104] (1).pdf` / `DemoQuestions.pdf`), all `method = 'ai'`.

### Row 1 — failed
| Column | Value |
|---|---|
| id | `d8403251-9d93-4aaa-b7e0-24a3979bd012` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `1353b614-fbc7-402a-8330-589dcc5dab08` |
| method | `ai` |
| notes_file_name | *(null)* |
| questions_file_name | `Histo MCQ by Dr.Zahra [104] (1).pdf` |
| status | `failed` |
| questions_extracted | 0 |
| questions_published | 0 |
| questions_under_review | 0 |
| error_message | `Object.defineProperty called on non-object` |
| created_at | 2026-07-18 16:09:17.867838+00 |
| completed_at | 2026-07-18 16:09:17.711+00 |

### Row 2 — failed
| Column | Value |
|---|---|
| id | `f3e3a405-f45e-452f-af58-6c852e5cfb91` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `1353b614-fbc7-402a-8330-589dcc5dab08` |
| method | `ai` |
| notes_file_name | `Histo Dr Zahra.pdf` |
| questions_file_name | `Histo MCQ by Dr.Zahra [104] (1).pdf` |
| status | `failed` |
| questions_extracted | 0 |
| questions_published | 0 |
| questions_under_review | 0 |
| error_message | `Object.defineProperty called on non-object` |
| created_at | 2026-07-18 16:09:41.785468+00 |
| completed_at | 2026-07-18 16:09:41.602+00 |

### Row 3 — failed
| Column | Value |
|---|---|
| id | `e4eb6552-004f-4a59-a4fd-56cb10dae70c` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `1353b614-fbc7-402a-8330-589dcc5dab08` |
| method | `ai` |
| notes_file_name | `Histo Dr Zahra.pdf` |
| questions_file_name | `Histo MCQ by Dr.Zahra [104] (1).pdf` |
| status | `failed` |
| questions_extracted | 0 |
| questions_published | 0 |
| questions_under_review | 0 |
| error_message | `No questions detected. Try a different file or add questions manually.` |
| created_at | 2026-07-22 14:52:52.848233+00 |
| completed_at | 2026-07-22 14:52:53.711+00 |

### Row 4 — processing (never resolved — see flag above)
| Column | Value |
|---|---|
| id | `fa4bf072-ca3c-4c6a-90e6-6a89e02d33fe` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `1353b614-fbc7-402a-8330-589dcc5dab08` |
| method | `ai` |
| notes_file_name | `Histo Dr Zahra.pdf` |
| questions_file_name | `Histo MCQ by Dr.Zahra [104] (1).pdf` |
| status | `processing` |
| questions_extracted | 0 |
| questions_published | 0 |
| questions_under_review | 0 |
| error_message | *(null)* |
| created_at | 2026-07-22 15:23:56.549425+00 |
| completed_at | *(null — never resolved)* |

### Row 5 — failed
| Column | Value |
|---|---|
| id | `f66539ab-e5bd-46e0-b178-cdb53926a3b3` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `1353b614-fbc7-402a-8330-589dcc5dab08` |
| method | `ai` |
| notes_file_name | *(null)* |
| questions_file_name | `Histo MCQ by Dr.Zahra [104] (1).pdf` |
| status | `failed` |
| questions_extracted | 0 |
| questions_published | 0 |
| questions_under_review | 0 |
| error_message | `No questions detected. Try a different file or add questions manually.` |
| created_at | 2026-07-22 15:41:23.146709+00 |
| completed_at | 2026-07-22 15:42:48.393+00 |

### Row 6 — completed (the successful run — source of the 11 questions above)
| Column | Value |
|---|---|
| id | `7c467905-9eb2-4bbf-b747-c4d877ae1a2a` |
| professor_id | `0aa4fa1f-a492-4361-9459-8933ebaf487a` |
| module_code | `104` |
| chapter_id | `b99fa275-cc5c-4bed-b086-06209337f970` |
| method | `ai` |
| notes_file_name | `Histo Dr Zahra.pdf` |
| questions_file_name | `DemoQuestions.pdf` |
| status | `completed` |
| questions_extracted | 10 |
| questions_published | 0 |
| questions_under_review | 10 |
| error_message | *(null)* |
| created_at | 2026-07-22 20:58:40.275572+00 |
| completed_at | 2026-07-22 21:02:09.318+00 |

Note: row 6's `chapter_id` (`b99fa275-...`) differs from rows 1–5 (`1353b614-...`) — the successful run was against a different chapter within module 104 than the earlier failed attempts.
