import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

// Same service-role client pattern as getSignedNotesPageUrl() in
// lib/ocr/notes-upload.ts — bypasses RLS, so no client-facing SELECT
// policy is needed on chapters/modules/reference_pages for this.
function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolves a question's book-page reference into a signed, viewable
 * image URL: chapter -> module -> modules.book_id -> the
 * reference_pages row matching (book_id, page_number = referencePage)
 * -> its image_url, signed the same way getSignedNotesPageUrl()
 * signs notes-pages objects. Shared by both the student fetch route
 * and the admin review route so there's one resolution path, not two.
 *
 * ASSUMPTION (flagged, unconfirmed): image_url is treated as a
 * private storage path inside the `notes-pages` bucket — the only
 * bucket that exists on this project (verified directly against
 * MedZ-Stu; no dedicated book/reference-pages bucket exists yet) —
 * not a public or already-signed URL. Nothing has ever populated
 * reference_pages in production, so this is unconfirmed against real
 * data. Whoever builds the book-digitization pipeline should confirm
 * this before it's trusted — do not assume it silently adapts if
 * image_url turns out to already be a full/public URL instead.
 *
 * Returns null for any "no reference to show" case (no reference_page,
 * module has no book, no matching reference_pages row) — only throws
 * on missing env config, same contract as getSignedNotesPageUrl().
 */
export async function getSignedBookPageUrl(
  chapterId: string | null | undefined,
  referencePage: number | null | undefined
): Promise<string | null> {
  if (!chapterId || !referencePage) return null;

  const supabase = serviceRoleClient();

  const { data: chapter } = await supabase
    .from('chapters')
    .select('module_code')
    .eq('id', chapterId)
    .single();
  if (!chapter?.module_code) return null;

  const { data: mod } = await supabase
    .from('modules')
    .select('book_id')
    .eq('code', chapter.module_code)
    .single();
  if (!mod?.book_id) return null;

  const { data: page } = await supabase
    .from('reference_pages')
    .select('image_url')
    .eq('book_id', mod.book_id)
    .eq('page_number', referencePage)
    .single();
  if (!page?.image_url) return null;

  const { data, error } = await supabase.storage
    .from('notes-pages')
    .createSignedUrl(page.image_url, 900);

  if (error || !data) {
    console.error('[book-reference] createSignedUrl failed:', error?.message);
    return null;
  }
  return data.signedUrl;
}
