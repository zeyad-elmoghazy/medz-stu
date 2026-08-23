import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { untypedFrom } from '@/lib/supabase-server';
import {
  extractPdfPages,
  extractQuestionsFromText,
  buildNotesIndex,
  annotateWithReferences,
  type ExtractedQuestion,
} from '@/lib/pdf-extract';
import { processPdf, ocrPdfToPages } from '@/lib/ocr/pipeline';
import { rasteriseAndUploadNotes } from '@/lib/ocr/notes-upload';
import { logActivity } from '@/lib/admin-activity';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OCR fallback rasterises + tesseracts every page; ~2s/page on a
// lecture-sized PDF so 60s is not enough.
export const maxDuration = 300;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/admin/content/upload
 *
 * Content Upload. The extraction pipeline (pdf-parse + regex
 * heuristic, with a Tesseract OCR fallback for scanned files) is
 * ported unchanged.
 *
 * multipart/form-data:
 *   moduleCode        — string
 *   chapterId         — uuid
 *   questions         — file (PDF of questions, required)
 *   notes             — file (PDF of lecture notes for reference lookup, optional)
 *   referenceBookId   — uuid (optional)
 *
 * FLAGGED, not resolved this port: referenceBookId still writes to
 * questions.reference_book_id below, same as the b2c-pivot-rebuild
 * source. That column is now dead under the module-owns-the-book
 * redesign (see 019_module_book_and_import_idempotency.sql and the
 * import route) — this route wasn't named for the same rewrite
 * admin/questions/route.ts got, so it's ported as-is rather than
 * silently changed. The field is optional and nothing requires a
 * caller to populate it, so this is inert unless someone still
 * passes it.
 *
 * Extracted rows land with status='under_review' in the Review
 * Queue, not published directly.
 */
export async function POST(request: Request) {
  const { user, supabase, error } = await requireAdmin();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const moduleCode = String(form.get('moduleCode') ?? '');
  const chapterId = String(form.get('chapterId') ?? '');
  const referenceBookId = form.get('referenceBookId') ? String(form.get('referenceBookId')) : null;
  const questionsFile = form.get('questions');
  const notesFile = form.get('notes');

  if (!moduleCode || !chapterId) {
    return NextResponse.json({ error: 'moduleCode and chapterId are required' }, { status: 400 });
  }
  if (!(questionsFile instanceof File)) {
    return NextResponse.json({ error: 'questions PDF required' }, { status: 400 });
  }
  if (questionsFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'questions file exceeds 10 MB limit' }, { status: 413 });
  }
  if (notesFile instanceof File && notesFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'notes file exceeds 10 MB limit' }, { status: 413 });
  }

  // Resolve chapter -> subject slug (chapters.subject_id is a
  // direct FK to subjects) — no need to go through the legacy
  // modules(subject_id) relation.
  const chapterRes = await untypedFrom(supabase)
    .from('chapters')
    .select('module_code, subjects(slug)')
    .eq('id', chapterId)
    .single();

  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const subjectSlug = (chapterRes.data as { subjects: { slug: string } | null }).subjects?.slug;
  if (!subjectSlug) {
    return NextResponse.json({ error: 'Chapter has no subject binding' }, { status: 500 });
  }

  const jobRes = await untypedFrom(supabase)
    .from('upload_jobs')
    .insert({
      professor_id: user.id, // legacy column name — always an admin now
      module_code: moduleCode,
      chapter_id: chapterId,
      method: 'ai',
      questions_file_name: questionsFile.name,
      notes_file_name: notesFile instanceof File ? notesFile.name : null,
      status: 'processing',
    })
    .select('id')
    .single();

  if (jobRes.error || !jobRes.data) {
    return NextResponse.json({ error: jobRes.error?.message ?? 'Failed to open job' }, { status: 500 });
  }
  const jobId = (jobRes.data as { id: string }).id;

  const patchJob = async (patch: Record<string, unknown>) => {
    await untypedFrom(supabase).from('upload_jobs').update(patch).eq('id', jobId);
  };

  try {
    // ---- 1) Extract text ----
    const qBuffer = Buffer.from(await questionsFile.arrayBuffer());
    const qPages = await extractPdfPages(qBuffer);
    const fullText = qPages.pages.map((p) => p.text).join('\n\n');

    // ---- 2) Notes index (optional reference source) ----
    let notesIndex: Awaited<ReturnType<typeof buildNotesIndex>> | null = null;
    let notesStoragePrefix: string | null = null;
    if (notesFile instanceof File) {
      const nBuffer = Buffer.from(await notesFile.arrayBuffer());
      notesIndex = await buildNotesIndex(nBuffer);

      if (notesIndex && looksScannedIndex(notesIndex)) {
        const notesTmp = path.join(os.tmpdir(), `medz-notes-${jobId}.pdf`);
        try {
          await writeFile(notesTmp, nBuffer);
          const ocrPages = await ocrPdfToPages(notesTmp);
          notesIndex = {
            totalPages: ocrPages.length,
            pages: ocrPages.map((p) => ({ page: p.page, text: p.text })),
          };
        } catch (err) {
          console.error('[admin/content/upload] notes OCR failed:', err);
        } finally {
          await unlink(notesTmp).catch(() => {});
        }
      }

      try {
        notesStoragePrefix = crypto.randomUUID();
        await rasteriseAndUploadNotes(nBuffer, notesStoragePrefix);
      } catch (err) {
        console.error('[admin/content/upload] notes image upload failed:', err);
        notesStoragePrefix = null;
      }
    }

    // ---- 3) Heuristic parse, ---- 4) OCR fallback ----
    let extracted = extractQuestionsFromText(fullText);
    const richExtras = new Map<number, { explanation?: string; reference?: string; pageNumber?: number }>();
    let extractionSource: 'regex' | 'ocr' = 'regex';

    if (extracted.length === 0) {
      const tempPath = path.join(os.tmpdir(), `medz-extract-${jobId}.pdf`);
      try {
        await writeFile(tempPath, qBuffer);
        const ocrResult = await processPdf(tempPath, { cleanupImages: true });
        if (ocrResult.questions.length > 0) {
          extracted = ocrResult.questions.map((q, i) => {
            const row: ExtractedQuestion = {
              question: q.questionText,
              choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
              correctAnswer: q.correctAnswer || undefined,
              reference: q.reference?.fullText,
            };
            richExtras.set(i, {
              explanation: q.explanation || undefined,
              reference: q.reference?.fullText,
              pageNumber: q.reference?.pageNumber ? parseInt(q.reference.pageNumber, 10) || undefined : undefined,
            });
            return row;
          });
          extractionSource = 'ocr';
        }
      } catch (err) {
        console.error('[admin/content/upload] OCR fallback failed:', err);
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    }

    // ---- 5) Reference annotation from notes ----
    extracted = annotateWithReferences(extracted, notesIndex);

    if (extracted.length === 0) {
      await patchJob({
        status: 'failed',
        error_message: 'No questions detected. Try a different file or add questions manually.',
        completed_at: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          jobId,
          extracted: 0,
          error: 'Could not detect any MCQs in that file. Verify the layout uses "1. …" question numbers and "a) …" option letters, or add them manually via Manual MCQ Entry.',
        },
        { status: 422 }
      );
    }

    // ---- 6) Insert as under_review (Review Queue) ----
    const maxRes = await untypedFrom(supabase)
      .from('questions')
      .select('subject_bundle_id')
      .eq('subject_id', subjectSlug)
      .order('subject_bundle_id', { ascending: false })
      .limit(1);
    let nextBundleId = ((maxRes.data as { subject_bundle_id: number }[] | null)?.[0]?.subject_bundle_id ?? 0) + 1;

    const rows = extracted.map((q, i) => {
      const correct = q.correctAnswer && q.choices.some((c) => c.id === q.correctAnswer) ? q.correctAnswer : q.choices[0].id;
      const extras = richExtras.get(i);
      const refPage = extras?.pageNumber ?? q.sourcePage ?? parseRefPageFromString(q.reference);
      return {
        subject_id: subjectSlug,
        subject_bundle_id: nextBundleId++,
        question: q.question,
        choices: q.choices,
        correct_answer: correct,
        explanation: extras?.explanation ?? '',
        reference: q.reference ?? extras?.reference ?? '',
        reference_book_id: referenceBookId,
        reference_page: refPage,
        topic: '',
        chapter_id: chapterId,
        professor_id: user.id,
        status: 'under_review',
        source: 'ai',
        difficulty: 'medium',
        notes_storage_prefix: notesStoragePrefix,
      };
    });

    const insertRes = await untypedFrom(supabase).from('questions').insert(rows).select('id');

    if (insertRes.error) {
      await patchJob({ status: 'failed', error_message: insertRes.error.message, completed_at: new Date().toISOString() });
      return NextResponse.json({ error: insertRes.error.message, jobId }, { status: 500 });
    }

    await patchJob({
      status: 'completed',
      questions_extracted: rows.length,
      questions_under_review: rows.length,
      completed_at: new Date().toISOString(),
    });

    await logActivity(supabase, {
      actorId: user.id,
      action: 'content_uploaded',
      entityType: 'upload_job',
      entityId: jobId,
      summary: `Uploaded "${questionsFile.name}" — ${rows.length} question(s) extracted into Review Queue for Module ${moduleCode}`,
    });

    return NextResponse.json({
      jobId,
      extracted: rows.length,
      insertedIds: ((insertRes.data ?? []) as { id: number }[]).map((r) => r.id),
      chapterId,
      subjectSlug,
      extractionSource,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed';
    await patchJob({ status: 'failed', error_message: msg, completed_at: new Date().toISOString() });
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}

function parseRefPageFromString(ref: string | undefined): number | null {
  if (!ref) return null;
  const m = ref.match(/[Pp](?:age)?\.?\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function looksScannedIndex(idx: { pages: { text: string }[] }): boolean {
  if (idx.pages.length === 0) return true;
  const total = idx.pages.reduce((n, p) => n + p.text.length, 0);
  return total / idx.pages.length < 20;
}
