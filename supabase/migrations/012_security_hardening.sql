-- 012_security_hardening.sql
-- Clears the Supabase security advisor board:
--   * RLS on all quiz_sessions_partitioned partitions
--   * Drop broad SELECT policy on notes-pages bucket (URL access still works)
--   * Trigger functions closed to API roles; RPCs get caller-identity checks
--   * Materialized views taken out of the anon/authenticated API surface
-- The behavior-changing pieces are already reflected in app/api/student/*
-- (matview reads switched to the service-role client).

-- ---------------------------------------------------------------------------
-- 1. RLS on partitioned quiz_sessions
-- ---------------------------------------------------------------------------
-- PostgREST exposes each partition as its own REST route and partitions do
-- NOT inherit the parent's policies, so RLS + policies must be applied to
-- every child. Iterating pg_inherits future-proofs against re-runs.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND (
        c.relname = 'quiz_sessions_partitioned'
        OR (c.relkind = 'r' AND EXISTS (
              SELECT 1 FROM pg_inherits i
              JOIN pg_class p ON p.oid = i.inhparent
              WHERE i.inhrelid = c.oid
                AND p.relname = 'quiz_sessions_partitioned'
            ))
      )
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tbl);

    EXECUTE format(
      'DROP POLICY IF EXISTS students_own_sessions ON %s;
       CREATE POLICY students_own_sessions ON %s
         FOR ALL USING (student_id = auth.uid())
         WITH CHECK (student_id = auth.uid());',
      r.tbl, r.tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS professors_read_sessions ON %s;
       CREATE POLICY professors_read_sessions ON %s
         FOR SELECT USING (EXISTS (
           SELECT 1 FROM profiles
           WHERE profiles.id = auth.uid()
             AND profiles.role = ''professor''
         ));',
      r.tbl, r.tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Storage: drop overbroad SELECT on notes-pages
-- ---------------------------------------------------------------------------
-- Public buckets serve object URLs directly; a SELECT policy on
-- storage.objects only enables listing every file in the bucket.

DROP POLICY IF EXISTS notes_pages_public_read ON storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Trigger functions: no client role needs EXECUTE
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_student_stats()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_chapter_counts()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_question_flag_count()  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.refresh_student_stats() SET search_path = 'public';

-- ---------------------------------------------------------------------------
-- 4. is_admin(): keep for RLS, close to anon
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 5. Stats RPCs: enforce caller identity
-- ---------------------------------------------------------------------------
-- Both functions previously accepted any uuid, letting any signed-in user
-- read anyone's stats. Caller must be the subject uuid or an admin.

CREATE OR REPLACE FUNCTION public.get_student_streak(p_student_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_streak      INTEGER := 0;
  v_check_date  DATE    := CURRENT_DATE;
  v_has_today   BOOLEAN;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> p_student_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM daily_streaks
    WHERE student_id = p_student_id
      AND streak_date = CURRENT_DATE
      AND challenges_completed > 0
  ) INTO v_has_today;

  IF NOT v_has_today THEN
    v_check_date := CURRENT_DATE - INTERVAL '1 day';
  END IF;

  LOOP
    IF EXISTS(
      SELECT 1 FROM daily_streaks
      WHERE student_id = p_student_id
        AND streak_date = v_check_date
        AND challenges_completed > 0
    ) THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_professor_stats(p_professor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> p_professor_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'my_students', (
      SELECT COUNT(DISTINCT qs.student_id)
      FROM quiz_sessions qs
      WHERE qs.subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'total_students', (SELECT COUNT(*) FROM profiles WHERE role = 'student'),
    'total_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id
    ),
    'published_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'published'
    ),
    'draft_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'draft'
    ),
    'under_review', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND status = 'under_review'
    ),
    'flagged_questions', (
      SELECT COUNT(*) FROM questions
      WHERE professor_id = p_professor_id AND flag_count > 0
    ),
    'total_attempts', (
      SELECT COUNT(*) FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'sessions_this_week', (
      SELECT COUNT(*) FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
      AND completed_at >= (NOW() - INTERVAL '7 days')
    ),
    'avg_accuracy', (
      SELECT COALESCE(ROUND(AVG(accuracy)::numeric, 1), 0)
      FROM quiz_sessions
      WHERE subject_id IN (
        SELECT subject_id FROM modules WHERE professor_id = p_professor_id
      )
    ),
    'modules', (
      SELECT COALESCE(json_agg(row_to_json(m_row) ORDER BY m_row.code), '[]'::json)
      FROM (
        SELECT
          m.code, m.name, m.subject_id, m.year_num, m.year_label, m.is_active,
          (SELECT COUNT(*) FROM chapters c WHERE c.module_code = m.code) AS chapter_count,
          (SELECT COALESCE(SUM(c.question_count),0) FROM chapters c WHERE c.module_code = m.code) AS question_count,
          (SELECT COALESCE(SUM(c.published_count),0) FROM chapters c WHERE c.module_code = m.code) AS published_count
        FROM modules m
        WHERE m.professor_id = p_professor_id OR p_professor_id IS NULL
      ) AS m_row
    ),
    'chapter_performance', (
      SELECT COALESCE(json_agg(row_to_json(cp) ORDER BY cp.avg_accuracy ASC NULLS LAST), '[]'::json)
      FROM (
        SELECT
          c.id, c.name, c.module_code, c.published_count,
          COALESCE(ROUND(AVG(qs.accuracy)::numeric, 0), 0) AS avg_accuracy
        FROM chapters c
        JOIN modules m ON m.code = c.module_code
        LEFT JOIN quiz_sessions qs ON qs.subject_id = m.subject_id
        WHERE m.professor_id = p_professor_id
        GROUP BY c.id, c.name, c.module_code, c.published_count
      ) AS cp
    ),
    'recent_activity', (
      SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.at DESC), '[]'::json)
      FROM (
        SELECT
          'session'::text AS kind,
          qs.completed_at AS at,
          p.full_name AS actor,
          qs.subject_id AS subject,
          qs.accuracy AS accuracy
        FROM quiz_sessions qs
        JOIN profiles p ON p.id = qs.student_id
        WHERE qs.subject_id IN (
          SELECT subject_id FROM modules WHERE professor_id = p_professor_id
        )
        ORDER BY qs.completed_at DESC
        LIMIT 8
      ) AS a
    ),
    'recent_uploads', (
      SELECT COALESCE(json_agg(row_to_json(u) ORDER BY u.created_at DESC), '[]'::json)
      FROM (
        SELECT id, module_code, chapter_id, method, status,
               questions_extracted, questions_published, created_at
        FROM upload_jobs
        WHERE professor_id = p_professor_id
        ORDER BY created_at DESC
        LIMIT 5
      ) AS u
    )
  ) INTO result;

  RETURN result;
END;
$function$;

-- CREATE OR REPLACE resets EXECUTE to defaults — re-lock and grant.
REVOKE EXECUTE ON FUNCTION public.get_student_streak(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_professor_stats(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_student_streak(uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_professor_stats(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Materialized views: revoke from anon/authenticated
-- ---------------------------------------------------------------------------
-- Matviews carry no RLS. Server-side routes now read them via the
-- service-role client.

REVOKE ALL ON public.student_analytics       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.student_subject_stats   FROM PUBLIC, anon, authenticated;
