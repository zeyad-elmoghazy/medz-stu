-- =============================================================
-- MediZee · retention.sql          READ-ONLY (SELECTs only)
-- =============================================================
-- Where do students drop off? Run each numbered query on its own in the
-- Supabase SQL editor (it only shows the last statement's result).
--
--   1. Funnel            signup -> confirmed -> started -> finished -> 2+ days
--   2. Weekly cohorts    the same funnel, per signup week
--   3. Quit point        how far through a chapter unfinished attempts stop
--   4. By source         the funnel per "how did you hear" answer (needs 043)
--
-- Definitions (students only, role = 'student'):
--   confirmed  auth.users.email_confirmed_at is set (Google signups are
--              confirmed by Google)
--   started    has ANY answered chapter attempt, Custom Exam attempt, or a
--              finished quiz
--   finished   has at least one finished quiz (quiz_sessions row)
--   2+ days    was active on 2 or more different calendar days (Cairo time),
--              counting finished quizzes, saved chapter/exam progress, and
--              daily_streaks. Saved progress only keeps its LAST save time,
--              so this slightly UNDER-counts people who practised on several
--              days without finishing anything.
--
-- Typical read: 46% of confirmed students never start; only 9 of 181
-- practised on 2+ days (audit of 2026-11-06). Re-run weekly and compare.
-- =============================================================


-- ---------- 1. Funnel -------------------------------------------------
WITH students AS (
  SELECT p.id, p.created_at, u.email_confirmed_at IS NOT NULL AS confirmed
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'student'
),
activity AS (
  SELECT student_id, (completed_at AT TIME ZONE 'Africa/Cairo')::date AS day FROM public.quiz_sessions
  UNION
  SELECT student_id, (updated_at AT TIME ZONE 'Africa/Cairo')::date FROM public.chapter_quiz_progress
  UNION
  SELECT student_id, (updated_at AT TIME ZONE 'Africa/Cairo')::date FROM public.custom_exam_progress
  UNION
  SELECT student_id, streak_date FROM public.daily_streaks
),
flags AS (
  SELECT
    s.id,
    s.confirmed,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id)
      OR EXISTS (SELECT 1 FROM public.chapter_quiz_progress c WHERE c.student_id = s.id AND c.answers <> '{}'::jsonb)
      OR EXISTS (SELECT 1 FROM public.custom_exam_progress e WHERE e.student_id = s.id AND e.answers <> '{}'::jsonb)
      AS started,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id) AS finished,
    (SELECT count(DISTINCT a.day) FROM activity a WHERE a.student_id = s.id) >= 2 AS two_days
  FROM students s
),
steps AS (
  SELECT 1 AS n, 'signed up' AS step, count(*) AS students FROM flags
  UNION ALL SELECT 2, 'confirmed email', count(*) FROM flags WHERE confirmed
  UNION ALL SELECT 3, 'started a quiz', count(*) FROM flags WHERE confirmed AND started
  UNION ALL SELECT 4, 'finished a quiz', count(*) FROM flags WHERE confirmed AND finished
  UNION ALL SELECT 5, 'active on 2+ days', count(*) FROM flags WHERE confirmed AND two_days
)
SELECT
  n, step, students,
  round(100.0 * students / NULLIF(first_value(students) OVER (ORDER BY n), 0), 1) AS pct_of_signups,
  round(100.0 * students / NULLIF(lag(students) OVER (ORDER BY n), 0), 1) AS pct_of_previous_step
FROM steps
ORDER BY n;


-- ---------- 2. Weekly signup cohorts -----------------------------------
WITH students AS (
  SELECT p.id, p.created_at, u.email_confirmed_at IS NOT NULL AS confirmed
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'student'
),
activity AS (
  SELECT student_id, (completed_at AT TIME ZONE 'Africa/Cairo')::date AS day FROM public.quiz_sessions
  UNION
  SELECT student_id, (updated_at AT TIME ZONE 'Africa/Cairo')::date FROM public.chapter_quiz_progress
  UNION
  SELECT student_id, (updated_at AT TIME ZONE 'Africa/Cairo')::date FROM public.custom_exam_progress
  UNION
  SELECT student_id, streak_date FROM public.daily_streaks
),
flags AS (
  SELECT
    s.id,
    date_trunc('week', s.created_at AT TIME ZONE 'Africa/Cairo')::date AS cohort_week,
    s.confirmed,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id)
      OR EXISTS (SELECT 1 FROM public.chapter_quiz_progress c WHERE c.student_id = s.id AND c.answers <> '{}'::jsonb)
      OR EXISTS (SELECT 1 FROM public.custom_exam_progress e WHERE e.student_id = s.id AND e.answers <> '{}'::jsonb)
      AS started,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id) AS finished,
    (SELECT count(DISTINCT a.day) FROM activity a WHERE a.student_id = s.id) >= 2 AS two_days
  FROM students s
)
SELECT
  cohort_week,
  count(*)                                        AS signed_up,
  count(*) FILTER (WHERE confirmed)               AS confirmed,
  count(*) FILTER (WHERE confirmed AND started)   AS started,
  count(*) FILTER (WHERE confirmed AND finished)  AS finished,
  count(*) FILTER (WHERE confirmed AND two_days)  AS two_plus_days,
  round(100.0 * count(*) FILTER (WHERE confirmed) / count(*), 1)                                   AS pct_confirmed,
  round(100.0 * count(*) FILTER (WHERE confirmed AND started)
        / NULLIF(count(*) FILTER (WHERE confirmed), 0), 1)                                         AS pct_of_confirmed_started
FROM flags
GROUP BY cohort_week
ORDER BY cohort_week DESC;


-- ---------- 3. Quit point of unfinished chapter attempts ----------------
-- Each bucket = how far through the chapter the student had got when they
-- last saved (current_question_index / total_questions). A spike at the
-- start means the first questions put people off; a spike near 100% means
-- they quit within sight of the end.
WITH attempts AS (
  SELECT
    c.student_id,
    c.total_questions,
    c.current_question_index,
    LEAST(10, FLOOR(10.0 * c.current_question_index / NULLIF(c.total_questions, 0))::int) AS bucket
  FROM public.chapter_quiz_progress c
  JOIN public.profiles p ON p.id = c.student_id AND p.role = 'student'
  WHERE c.answers <> '{}'::jsonb AND c.total_questions > 0
)
SELECT
  bucket * 10 || '-' || LEAST(bucket * 10 + 9, 100) || '%' AS progress_when_stopped,
  count(*)                                                 AS attempts,
  count(DISTINCT student_id)                               AS students,
  round(avg(current_question_index), 1)                    AS avg_question_index,
  round(avg(total_questions), 1)                           AS avg_chapter_length
FROM attempts
GROUP BY bucket
ORDER BY bucket;


-- ---------- 4. Funnel by signup source (apply 043 first) ----------------
-- NULL source = signed up before the question existed, or skipped it.
WITH students AS (
  SELECT p.id, COALESCE(p.signup_source, '(not answered)') AS source,
         u.email_confirmed_at IS NOT NULL AS confirmed
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'student'
),
flags AS (
  SELECT
    s.source, s.confirmed,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id)
      OR EXISTS (SELECT 1 FROM public.chapter_quiz_progress c WHERE c.student_id = s.id AND c.answers <> '{}'::jsonb)
      OR EXISTS (SELECT 1 FROM public.custom_exam_progress e WHERE e.student_id = s.id AND e.answers <> '{}'::jsonb)
      AS started,
    EXISTS (SELECT 1 FROM public.quiz_sessions q WHERE q.student_id = s.id) AS finished
  FROM students s
)
SELECT
  source,
  count(*)                                       AS signed_up,
  count(*) FILTER (WHERE confirmed)              AS confirmed,
  count(*) FILTER (WHERE confirmed AND started)  AS started,
  count(*) FILTER (WHERE confirmed AND finished) AS finished,
  round(100.0 * count(*) FILTER (WHERE confirmed AND started)
        / NULLIF(count(*) FILTER (WHERE confirmed), 0), 1) AS pct_of_confirmed_started
FROM flags
GROUP BY source
ORDER BY signed_up DESC;
