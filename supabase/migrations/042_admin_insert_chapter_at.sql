-- MediZee · 042_admin_insert_chapter_at.sql
--
-- Lets an admin insert a chapter at a given position inside a
-- (module, subject) pair. Every chapter already at or after that
-- position moves down by one, in the same transaction as the insert.
--
-- Why: long chapters are being split into 10–20-question chapters by
-- hand in the admin panel. Before this, a new chapter could only be
-- appended (ordinal = max + 1), and putting "Part 2" right after
-- "Part 1" meant renumbering every later chapter one PATCH at a time.
--
-- The new chapter can also carry the topic and reference book of the
-- chapter it was split from. Without default_book_id the reference
-- image falls back to the module's book (lib/book-reference.ts), which
-- is the wrong book for modules whose subjects use different books.
--
-- Safety:
--   * SECURITY INVOKER: the caller's own RLS applies, and only admins
--     can write `chapters` (policy chapters_admin_write). The explicit
--     private.is_admin() check just gives a clear error first.
--   * A per-(module, subject) advisory lock stops two admins from
--     shifting the same list at once and producing duplicate ordinals.
--   * Additive: old app code never calls this function.

CREATE OR REPLACE FUNCTION public.admin_insert_chapter_at(
  p_module_code        text,
  p_subject_id         uuid,
  p_name               text,
  p_slug               text,
  p_ordinal            integer,
  p_topic              text    DEFAULT NULL,
  p_default_book_id    uuid    DEFAULT NULL,
  p_default_page_start integer DEFAULT NULL
)
RETURNS public.chapters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_row public.chapters;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  IF p_ordinal IS NULL OR p_ordinal < 1 THEN
    RAISE EXCEPTION 'ordinal_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('chapters:' || p_module_code || ':' || p_subject_id::text, 0)
  );

  UPDATE public.chapters
     SET ordinal = ordinal + 1
   WHERE module_code = p_module_code
     AND subject_id  = p_subject_id
     AND ordinal    >= p_ordinal;

  INSERT INTO public.chapters
    (module_code, subject_id, slug, name, ordinal, topic, default_book_id, default_page_start)
  VALUES
    (p_module_code, p_subject_id, p_slug, p_name, p_ordinal, p_topic, p_default_book_id, p_default_page_start)
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_chapter_at(text, uuid, text, text, integer, text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_insert_chapter_at(text, uuid, text, text, integer, text, uuid, integer)
  TO authenticated, service_role;
