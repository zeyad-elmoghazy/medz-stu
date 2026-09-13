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

/**
 * Covers the chapters.default_book_id override added on top of the
 * chain above: when a chapter sets its own book, the resolver must
 * use it instead of the module's book — even when both books have a
 * reference_pages row at the same page number, so a test that only
 * checked "resolves to *a* URL" couldn't tell them apart.
 */
describeIfSupabase('book-resolver default_book_id override', () => {
  const admin = getServiceRoleClient();
  const moduleStoragePath = `book-reference-test/${uniqueSlug('module-page')}.txt`;
  const overrideStoragePath = `book-reference-test/${uniqueSlug('override-page')}.txt`;
  const moduleFixtureBytes = `module book contents ${Date.now()}`;
  const overrideFixtureBytes = `override book contents ${Date.now()}`;
  const pageNumber = 3;

  let subjectId: string;
  let subjectSlug: string;
  let moduleCode: string;
  let chapterId: string;
  let moduleBookId: string;
  let overrideBookId: string;
  let modulePageId: string;
  let overridePageId: string;

  beforeEach(async () => {
    subjectSlug = uniqueSlug('subject');
    const { data: subject, error: subjectErr } = await admin
      .from('subjects')
      .insert({ slug: subjectSlug, name: subjectSlug })
      .select('id')
      .single();
    if (subjectErr || !subject) throw new Error(`subject fixture failed: ${subjectErr?.message}`);
    subjectId = (subject as { id: string }).id;

    const { data: moduleBook, error: moduleBookErr } = await admin
      .from('reference_books')
      .insert({ title: uniqueSlug('module-book') })
      .select('id')
      .single();
    if (moduleBookErr || !moduleBook) throw new Error(`module book fixture failed: ${moduleBookErr?.message}`);
    moduleBookId = (moduleBook as { id: string }).id;

    const { data: overrideBook, error: overrideBookErr } = await admin
      .from('reference_books')
      .insert({ title: uniqueSlug('override-book') })
      .select('id')
      .single();
    if (overrideBookErr || !overrideBook) throw new Error(`override book fixture failed: ${overrideBookErr?.message}`);
    overrideBookId = (overrideBook as { id: string }).id;

    moduleCode = uniqueSlug('module');
    const { error: moduleErr } = await admin
      .from('modules')
      .insert({ code: moduleCode, subject_id: subjectSlug, name: moduleCode, book_id: moduleBookId });
    if (moduleErr) throw new Error(`module fixture failed: ${moduleErr.message}`);

    const chapterSlug = uniqueSlug('chapter');
    const { data: chapter, error: chapterErr } = await admin
      .from('chapters')
      .insert({
        module_code: moduleCode,
        subject_id: subjectId,
        slug: chapterSlug,
        name: chapterSlug,
        default_book_id: overrideBookId,
      })
      .select('id')
      .single();
    if (chapterErr || !chapter) throw new Error(`chapter fixture failed: ${chapterErr?.message}`);
    chapterId = (chapter as { id: string }).id;

    const { error: moduleUploadErr } = await admin.storage
      .from('notes-pages')
      .upload(moduleStoragePath, Buffer.from(moduleFixtureBytes), {
        contentType: 'text/plain',
        upsert: true,
      });
    if (moduleUploadErr) throw new Error(`module storage fixture upload failed: ${moduleUploadErr.message}`);

    const { error: overrideUploadErr } = await admin.storage
      .from('notes-pages')
      .upload(overrideStoragePath, Buffer.from(overrideFixtureBytes), {
        contentType: 'text/plain',
        upsert: true,
      });
    if (overrideUploadErr) throw new Error(`override storage fixture upload failed: ${overrideUploadErr.message}`);

    // Same page number in both books, deliberately, so the test can
    // only pass if the resolver picked the override book specifically
    // — not merely "a" book with a matching page.
    const { data: modulePage, error: modulePageErr } = await admin
      .from('reference_pages')
      .insert({ book_id: moduleBookId, page_number: pageNumber, image_url: moduleStoragePath })
      .select('id')
      .single();
    if (modulePageErr || !modulePage) throw new Error(`module reference_pages fixture failed: ${modulePageErr?.message}`);
    modulePageId = (modulePage as { id: string }).id;

    const { data: overridePage, error: overridePageErr } = await admin
      .from('reference_pages')
      .insert({ book_id: overrideBookId, page_number: pageNumber, image_url: overrideStoragePath })
      .select('id')
      .single();
    if (overridePageErr || !overridePage) throw new Error(`override reference_pages fixture failed: ${overridePageErr?.message}`);
    overridePageId = (overridePage as { id: string }).id;
  });

  afterEach(async () => {
    await admin.from('reference_pages').delete().eq('id', modulePageId);
    await admin.from('reference_pages').delete().eq('id', overridePageId);
    await admin.storage.from('notes-pages').remove([moduleStoragePath, overrideStoragePath]);
    await admin.from('chapters').delete().eq('id', chapterId);
    await admin.from('modules').delete().eq('code', moduleCode);
    await admin.from('reference_books').delete().eq('id', moduleBookId);
    await admin.from('reference_books').delete().eq('id', overrideBookId);
    await admin.from('subjects').delete().eq('id', subjectId);
  });

  test('uses chapters.default_book_id instead of modules.book_id when set', async () => {
    const url = await getSignedBookPageUrl(chapterId, pageNumber);
    expect(url).toBeTruthy();

    const res = await fetch(url as string);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe(overrideFixtureBytes);
    expect(text).not.toBe(moduleFixtureBytes);
  });

  test('falls back to modules.book_id when default_book_id is cleared', async () => {
    await admin.from('chapters').update({ default_book_id: null }).eq('id', chapterId);
    const url = await getSignedBookPageUrl(chapterId, pageNumber);
    expect(url).toBeTruthy();

    const res = await fetch(url as string);
    const text = await res.text();
    expect(text).toBe(moduleFixtureBytes);
  });
});
