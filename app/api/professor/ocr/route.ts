import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { processPdf } from '@/lib/ocr/pipeline';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createRouteHandlerClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileRes = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: unknown) => {
            single: () => Promise<{ data: { role?: string } | null }>;
          };
        };
      };
    }
  )
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profileRes.data?.role !== 'professor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const subjectId = (formData.get('subjectId') as string) ?? 'histology';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!file.type.includes('pdf')) {
    return NextResponse.json(
      { error: 'Only PDF files accepted' },
      { status: 400 }
    );
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'File too large (max 20MB)' },
      { status: 400 }
    );
  }

  const tempPath = path.join(os.tmpdir(), `medz-upload-${Date.now()}.pdf`);

  try {
    const bytes = await file.arrayBuffer();
    await writeFile(tempPath, Buffer.from(bytes));

    const result = await processPdf(tempPath, {
      subjectId,
      professorId: session.user.id,
      cleanupImages: true,
    });

    return NextResponse.json({
      success: result.success,
      questionsFound: result.questionsFound,
      totalPages: result.totalPages,
      averageConfidence: result.averageConfidence,
      lowConfidenceQuestions: result.lowConfidenceQuestions,
      processingTimeMs: result.processingTimeMs,
      questions: result.questions,
      errors: result.errors,
    });
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // non-fatal
    }
  }
}
