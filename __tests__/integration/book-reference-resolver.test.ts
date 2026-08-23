import { getSignedBookPageUrl } from '@/lib/book-reference';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  uniqueSlug,
} from '../helpers/supabase-test-env';

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * End-to-end check of the real resolution chain getSignedBookPageUrl()
 * walks: chapter -> module_code -> modules.book_id -> reference_pages
 * (book_id, page_number) -> image_url -> a real signed URL against the
 * notes-pages bucket. A real object is uploaded so the returned URL is
 * verified by actually fetching it, not just asserting non-null.
 */
describeIfSupabase('book-resolver signed-URL chain', () => {
  const admin = getServiceRoleClient();
  const storagePath = `book-reference-test/${uniqueSlug('page')}.txt`;
  const fixtureBytes = `fixture page contents ${Date.now()}`;

  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let bookId: string;
  let referencePageId: string;
  const pageNumber = 7;

  beforeEach(async () => {
    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id')
      .single();
    if (subjectErr || !subject) throw new Error(`subject fixture failed: ${subjectErr?.message}`);
    subjectId = (subject as { id: string }).id;

    const { data: book, error: bookErr } = await admin
      .from('reference_books')
      .insert({ title: uniqueSlug('book') })
      .select('id')
      .single();
    if (bookErr || !book) throw new Error(`reference_books fixture failed: ${bookErr?.message}`);
    bookId = (book as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const { error: moduleErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: moduleCode, book_id: bookId });
    if (moduleErr) throw new Error(`module fixture failed: ${moduleErr.message}`);

    const chapterSlug = uniqueSlug('chapter');
    const { data: chapter, error: chapterErr } = await admin
      .from('chapters')
      .insert({
        module_code: moduleCode,
        subject_id: subjectId,
        slug: chapterSlug,
        name: chapterSlug,
      })
      .select('id')
      .single();
    if (chapterErr || !chapter) throw new Error(`chapter fixture failed: ${chapterErr?.message}`);
    chapterId = (chapter as { id: string }).id;

    const { error: uploadErr } = await admin.storage
      .from('notes-pages')
      .upload(storagePath, Buffer.from(fixtureBytes), {
        contentType: 'text/plain',
        upsert: true,
      });
    if (uploadErr) throw new Error(`storage fixture upload failed: ${uploadErr.message}`);

    const { data: page, error: pageErr } = await admin
      .from('reference_pages')
      .insert({ book_id: bookId, page_number: pageNumber, image_url: storagePath })
      .select('id')
      .single();
    if (pageErr || !page) throw new Error(`reference_pages fixture failed: ${pageErr?.message}`);
    referencePageId = (page as { id: string }).id;
  });

  afterEach(async () => {
    await admin.from('reference_pages').delete().eq('id', referencePageId);
    await admin.storage.from('notes-pages').remove([storagePath]);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('reference_books').delete().eq('id', bookId);
    await admin.from('subjects').delete().eq('id', subjectId);
  });

  test('resolves chapter -> module book -> reference page -> real signed URL', async () => {
    const url = await getSignedBookPageUrl(chapterId, pageNumber);
    expect(url).toBeTruthy();

    const res = await fetch(url as string);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe(fixtureBytes);
  });

  test('returns null when the module has no book assigned', async () => {
    await admin.from('modules').update({ book_id: null }).eq('code', moduleCode);
    const url = await getSignedBookPageUrl(chapterId, pageNumber);
    expect(url).toBeNull();
  });

  test('returns null when no reference_pages row matches the page number', async () => {
    const url = await getSignedBookPageUrl(chapterId, pageNumber + 1);
    expect(url).toBeNull();
  });
});
