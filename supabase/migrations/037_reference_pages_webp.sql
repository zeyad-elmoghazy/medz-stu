-- 037_reference_pages_webp.sql
-- Repoint reference_pages.image_url from the original PNG to its WebP copy.
--
-- Run ONLY after scripts/import/reencode-reference-pages.mjs --apply has uploaded the
-- .webp objects and `--verify` reports 0 failures. The EXISTS guard makes this safe to
-- run early or twice: a row is only repointed when its .webp object is really in the
-- bucket, so a page whose upload failed (or a fresh local DB with no storage objects)
-- keeps its PNG and keeps working. lib/book-reference.ts treats image_url as an opaque
-- storage path, so no code change is needed.
--
-- The original PNGs are NOT deleted. Rollback (instant, no data loss):
--   UPDATE reference_pages
--      SET image_url = regexp_replace(image_url, '\.webp$', '.png', 'i')
--    WHERE image_url ~* '\.webp$'
--      AND EXISTS (SELECT 1 FROM storage.objects o
--                  WHERE o.bucket_id = 'notes-pages'
--                    AND o.name = regexp_replace(reference_pages.image_url, '\.webp$', '.png', 'i'));

UPDATE reference_pages rp
   SET image_url = regexp_replace(rp.image_url, '\.png$', '.webp', 'i')
 WHERE rp.image_url ~* '\.png$'
   AND EXISTS (
     SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'notes-pages'
        AND o.name = regexp_replace(rp.image_url, '\.png$', '.webp', 'i')
   );
