import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/apply-rate-limit';
import { tryLimiter } from '@/lib/rate-limit';
import { getSignedBookPageUrl } from '@/lib/book-reference';
import { loadTrySample } from '@/lib/server/try-questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/try/reference-image?year=N&questionId=N
 *
 * The book-page image behind a /try question, as a short-lived signed URL,
 * for the Reference tab after the visitor has answered. Public (no account),
 * so it signs ONLY the page cited by a question in that year's /try sample:
 * the chapter and page come from our own row, never from the request, so it
 * cannot be used to sign any other page of any book. Counterpart of
 * /api/student/chapters/[chapterId]/reference-image. Limited per IP.
 *
 * `{ url: null }` means "no image to show" (no page cited, or no page scan).
 */
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, tryLimiter);
  if (limited) return limited;

  // A missing or blank parameter must not turn into 0 (Number(null) === 0).
  const intParam = (name: string): number | null => {
    const raw = request.nextUrl.searchParams.get(name);
    return raw !== null && raw.trim() !== '' && Number.isInteger(Number(raw)) ? Number(raw) : null;
  };
  const year = intParam('year');
  const questionId = intParam('questionId');
  if (year === null || questionId === null) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE });
  }

  let row;
  try {
    row = (await loadTrySample(year))?.rows.find((r) => r.id === questionId);
  } catch (err) {
    console.error('[try/reference-image]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500, headers: NO_STORE });
  }
  if (!row) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404, headers: NO_STORE });
  }
  if (!row.reference_page) {
    return NextResponse.json({ url: null }, { headers: NO_STORE });
  }

  try {
    const url = await getSignedBookPageUrl(row.chapter_id, row.reference_page);
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (err) {
    // The image is a nicety: the explanation and reference text still show.
    console.error('[try/reference-image] signing failed', err);
    return NextResponse.json({ url: null }, { headers: NO_STORE });
  }
}
