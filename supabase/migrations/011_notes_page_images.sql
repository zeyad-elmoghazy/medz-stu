-- 011_notes_page_images.sql
--
-- When a professor uploads a questions PDF + notes PDF via the
-- AI-authoring wizard, we rasterise each page of the notes PDF
-- and upload the PNGs to Supabase Storage. Each extracted
-- question stores a pointer back to those images so the student
-- can view the page the answer comes from directly in the
-- Reference tab.
--
-- Two columns on `questions` are enough — denormalized on purpose.
-- No separate `notes_bundles` table: the storage prefix is a UUID
-- that groups every page of one upload, and the reference_page is
-- the OCR-extracted page number.
--
-- Also creates a public Storage bucket `notes-pages`. Public read
-- because students need to see the images from any device without
-- signing every URL; write is limited to the service role (the
-- upload-extract route uses the service key server-side).

alter table questions
  add column if not exists notes_storage_prefix text,
  add column if not exists reference_page int;

-- Bucket. Public so student pages can render <img> directly.
insert into storage.buckets (id, name, public)
values ('notes-pages', 'notes-pages', true)
on conflict (id) do nothing;

-- Anyone can SELECT (public read for images).
drop policy if exists "notes_pages_public_read" on storage.objects;
create policy "notes_pages_public_read"
  on storage.objects for select
  using (bucket_id = 'notes-pages');

-- Server-side upload only. The route uses the service_role client
-- (which bypasses RLS by design), so no INSERT policy is required
-- for authenticated users. Explicitly deny anyone else to avoid
-- accidental writes from the browser client.
drop policy if exists "notes_pages_no_client_write" on storage.objects;
create policy "notes_pages_no_client_write"
  on storage.objects for insert
  with check (bucket_id <> 'notes-pages');
