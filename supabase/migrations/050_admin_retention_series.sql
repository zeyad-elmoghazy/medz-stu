-- =============================================================
-- MedZ · 050_admin_retention_series.sql
-- =============================================================
-- Retention funnel for the admin dashboard (Retention tab), as a time series.
--
-- Every funnel step is "the first moment this student reached it", so the
-- funnel as of any time T is just the number of students whose moment is
-- <= T. One query therefore gives the current table, the Nov 6 baseline
-- column and the history chart.
--
-- Steps (students only, role = 'student'; each counted from ALL signups, not
-- gated on the previous step):
--   signed_up   profiles.created_at
--   confirmed   auth.users.email_confirmed_at  (only readable from here)
--   started     first finished quiz, or first chapter / custom-exam attempt
--               that has at least one answer
--   finished_1  1st quiz_sessions row           (every row is a finished quiz)
--   finished_2  2nd quiz_sessions row
--   days_2      first finish that falls on a 2nd distinct Cairo calendar day
--   days_3      first finish that falls on a 3rd distinct Cairo calendar day
--
-- Caveat: unfinished-attempt rows are deleted when the attempt is finished,
-- so for a student who started, saved, and finished later, "started" is
-- dated at their first finish. Past `started` values are therefore a little
-- late (a slight under-count); today's value is exact.
--
-- p_step 'day'  -> one point per Cairo calendar day, at the END of that day
-- p_step 'hour' -> one point per hour, at the END of that hour
-- Points are never in the future (the last one is capped at now()), and one
-- call returns at most 100 points. p_from / p_to only pick which days or
-- hours are covered.
--
-- ADDITIVE: old app code never calls this. The route that does degrades to
-- an empty result if this migration has not been applied yet.
--
-- Rollback:
--   DROP FUNCTION public.admin_retention_series(timestamptz, timestamptz, text);
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_retention_series(
  p_from timestamptz,
  p_to   timestamptz,
  p_step text
)
RETURNS TABLE (
  t          timestamptz,
  signed_up  bigint,
  confirmed  bigint,
  started    bigint,
  finished_1 bigint,
  finished_2 bigint,
  days_2     bigint,
  days_3     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_to      timestamptz;
  d0        date;
  d1        date;
  h_count   integer;
  max_pts   CONSTANT integer := 100;
BEGIN
  -- SECURITY DEFINER (needed to read auth.users), so the admin check is the
  -- only gate: it must stay the first statement.
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_step IS NULL
     OR p_step NOT IN ('hour', 'day') OR p_to < p_from THEN
    RAISE EXCEPTION 'range_invalid' USING ERRCODE = '22023';
  END IF;

  v_to := LEAST(p_to, now());
  IF v_to < p_from THEN
    RETURN;  -- the whole range is in the future
  END IF;

  d0 := (p_from AT TIME ZONE 'Africa/Cairo')::date;
  d1 := (v_to   AT TIME ZONE 'Africa/Cairo')::date;
  h_count := ((extract(epoch FROM date_trunc('hour', v_to) - date_trunc('hour', p_from))) / 3600)::integer;

  IF (p_step = 'day'  AND d1 - d0 + 1   > max_pts)
  OR (p_step = 'hour' AND h_count + 1   > max_pts) THEN
    RAISE EXCEPTION 'range_too_large' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH pts AS (
    SELECT DISTINCT LEAST(((d0 + i + 1)::timestamp AT TIME ZONE 'Africa/Cairo'), now()) AS pt
    FROM generate_series(0, d1 - d0) AS i
    WHERE p_step = 'day'
    UNION
    SELECT DISTINCT LEAST(date_trunc('hour', p_from) + (i + 1) * interval '1 hour', now())
    FROM generate_series(0, h_count) AS i
    WHERE p_step = 'hour'
  ),
  st AS (
    SELECT p.id, p.created_at AS signed_up_at, u.email_confirmed_at AS confirmed_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'student'
  ),
  fin AS (
    SELECT q.student_id, q.completed_at,
           row_number() OVER (PARTITION BY q.student_id ORDER BY q.completed_at) AS rn,
           dense_rank() OVER (
             PARTITION BY q.student_id
             ORDER BY (q.completed_at AT TIME ZONE 'Africa/Cairo')::date
           ) AS dr
    FROM public.quiz_sessions q
  ),
  fa AS (
    SELECT student_id,
           min(completed_at) FILTER (WHERE rn = 1) AS f1,
           min(completed_at) FILTER (WHERE rn = 2) AS f2,
           min(completed_at) FILTER (WHERE dr = 2) AS dy2,
           min(completed_at) FILTER (WHERE dr = 3) AS dy3
    FROM fin
    GROUP BY student_id
  ),
  pa AS (
    SELECT x.student_id, min(x.started_at) AS first_at
    FROM (
      SELECT c.student_id, c.started_at
      FROM public.chapter_quiz_progress c WHERE c.answers <> '{}'::jsonb
      UNION ALL
      SELECT e.student_id, e.started_at
      FROM public.custom_exam_progress e WHERE e.answers <> '{}'::jsonb
    ) x
    GROUP BY x.student_id
  ),
  per AS (
    SELECT s.signed_up_at, s.confirmed_at,
           LEAST(fa.f1, pa.first_at) AS started_at,  -- LEAST ignores NULLs
           fa.f1, fa.f2, fa.dy2, fa.dy3
    FROM st s
    LEFT JOIN fa ON fa.student_id = s.id
    LEFT JOIN pa ON pa.student_id = s.id
  )
  SELECT pts.pt,
         count(per.signed_up_at) FILTER (WHERE per.signed_up_at <= pts.pt),
         count(per.confirmed_at) FILTER (WHERE per.confirmed_at <= pts.pt),
         count(per.started_at)   FILTER (WHERE per.started_at   <= pts.pt),
         count(per.f1)           FILTER (WHERE per.f1           <= pts.pt),
         count(per.f2)           FILTER (WHERE per.f2           <= pts.pt),
         count(per.dy2)          FILTER (WHERE per.dy2          <= pts.pt),
         count(per.dy3)          FILTER (WHERE per.dy3          <= pts.pt)
  FROM pts
  LEFT JOIN per ON true
  GROUP BY pts.pt
  ORDER BY pts.pt;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_retention_series(timestamptz, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retention_series(timestamptz, timestamptz, text)
  TO authenticated, service_role;

COMMIT;
