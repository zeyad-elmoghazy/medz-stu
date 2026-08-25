import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, untypedFrom } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/student/chapters/[chapterId]/reference-image?page=N
 *
 * On-demand signed URL for one book-page reference image, resolved
 * the moment the chapter-scoped quiz needs it (after a question is
 * answered) rather than eagerly for every question up front —
 * unlike /api/questions/[subjectId], which resolves referenceImageUrl
 * for its whole (11-question, static) bank in one request. Same
 * getSignedBookPageUrl() resolution, same server-only constraint
 * (it transitively imports next/headers via lib/supabase-server),
 * which is why this can't be called directly from the 'use client'
 * quiz page.
 *
 * Auth: signed in (if(!user)-only, same as the sibling questions
 * route), plus an explicit check that some published question in
 * this chapter actually cites this page — otherwise chapterId+page
 * alone would let any signed-in user sign a URL for any page of any
 * linked book, including pages that only belong to under_review
 * questions or chapters with no published content at all.
 * getSignedBookPageUrl() itself never touches the questions table,
 * so this route is the only place that boundary can be enforced.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ chapterId: string }> }
) {
  const params = await props.params;
  const supabase = await createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pageParam = request.nextUrl.searchParams.get('page');
  const page = pageParam ? Number(pageParam) : NaN;
  if (!Number.isInteger(page) || page <= 0) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  const client = untypedFrom(supabase);
  const { data: match } = await client
    .from('questions')
    .select('id')
    .eq('chapter_id', params.chapterId)
    .eq('reference_page', page)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ url: null });
  }

  const { getSignedBookPageUrl } = await import('@/lib/book-reference');
  const url = await getSignedBookPageUrl(params.chapterId, page);

  return NextResponse.json({ url });
}
