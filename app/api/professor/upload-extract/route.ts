import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/supabase';
import {
  extractPdfPages,
  extractQuestionsFromText,
  buildNotesIndex,
  annotateWithReferences,
  type ExtractedQuestion,
} from '@/lib/pdf-extract';
import { processPdf, ocrPdfToPages } from '@/lib/ocr/pipeline';
import { rasteriseAndUploadNotes } from '@/lib/ocr/notes-upload';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OCR fallback rasterises + tesseracts every page; ~2s/page on
// a lecture-sized PDF so 60s is not enough. 300s matches the
// /api/professor/ocr endpoint.
export const maxDuration = 300;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/professor/upload-extract
 *
 * multipart/form-data:
 *   moduleCode   — string
 *   chapterId    — uuid
 *   questions    — file (PDF of questions, required)
 *   notes        — file (PDF of lecture notes for reference lookup, optional)
 *
 * Cost model:
 *   1. Text extraction via pdf-parse — free, ~200ms per PDF
 *   2. Heuristic MCQ regex parser    — free, sub-millisecond
 *   3. LLM fallback                  — ONLY invoked when
 *      the heuristic yields 0 questions. Even then we send
 *      cleaned text, never raw PDF bytes.
 *
 * The extracted rows are inserted with status='under_review'.
 * The professor approves them in the Question Bank before
 * students see them.
 */
export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const moduleCode = String(form.get('moduleCode') ?? '');
  const chapterId = String(form.get('chapterId') ?? '');
  const questionsFile = form.get('questions');
  const notesFile = form.get('notes');

  if (!moduleCode || !chapterId) {
    return NextResponse.json(
      { error: 'moduleCode and chapterId are required' },
      { status: 400 }
    );
  }
  if (!(questionsFile instanceof File)) {
    return NextResponse.json({ error: 'questions PDF required' }, { status: 400 });
  }
  if (questionsFile.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: 'questions file exceeds 10 MB limit' },
      { status: 413 }
    );
  }
  if (notesFile instanceof File && notesFile.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: 'notes file exceeds 10 MB limit' },
      { status: 413 }
    );
  }

  // Resolve chapter → subject for the insert path.
  const chapterRes = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          single: () => Promise<{
            data: {
              module_code: string;
              modules: { subject_id: string } | { subject_id: string }[] | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('chapters')
    .select('module_code, modules(subject_id)')
    .eq('id', chapterId)
    .single();

  if (chapterRes.error || !chapterRes.data) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const modulesRel = chapterRes.data.modules;
  const subjectId = Array.isArray(modulesRel)
    ? modulesRel[0]?.subject_id
    : modulesRel?.subject_id;
  if (!subjectId) {
    return NextResponse.json(
      { error: 'Chapter has no subject binding' },
      { status: 500 }
    );
  }

  // Create the upload_jobs row up-front so the client polls a
  // real row even if extraction fails mid-way.
  const jobRes = await (supabase as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('upload_jobs')
    .insert({
      professor_id: user.id,
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
    return NextResponse.json(
      { error: jobRes.error?.message ?? 'Failed to open job' },
      { status: 500 }
    );
  }
  const jobId = jobRes.data.id;

  const patchJob = async (patch: Record<string, unknown>) => {
    await (supabase as unknown as {
      from: (t: string) => {
        update: (r: Record<string, unknown>) => {
          eq: (c: string, v: unknown) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
    })
      .from('upload_jobs')
      .update(patch)
      .eq('id', jobId);
  };

  try {
    // ---- 1) Extract text ----
    const qBuffer = Buffer.from(await questionsFile.arrayBuffer());
    const qPages = await extractPdfPages(qBuffer);
    const fullText = qPages.pages.map((p) => p.text).join('\n\n');

    // ---- 2) Notes index (optional) ----
    // Two things happen with the notes file:
    //   a. Build a text index so annotateWithReferences can match
    //      each question stem to the notes page it came from.
    //      pdf-parse first; if the notes look scanned, OCR them.
    //   b. Rasterise + upload every page to Storage so the student
    //      can see the actual page image next to the question.
    let notesIndex = null;
    let notesStoragePrefix: string | null = null;
    if (notesFile instanceof File) {
      const nBuffer = Buffer.from(await notesFile.arrayBuffer());
      notesIndex = await buildNotesIndex(nBuffer);

      // Scanned-notes fallback: if pdf-parse extracted almost
      // nothing, OCR the notes pages and rebuild the index from
      // recognised text.
      if (notesIndex && looksScannedIndex(notesIndex)) {
        const notesTmp = path.join(os.tmpdir(), `medz-notes-${jobId}.pdf`);
        try {
          await writeFile(notesTmp, nBuffer);
          const ocrPages = await ocrPdfToPages(notesTmp);
          notesIndex = {
            totalPages: ocrPages.length,
            pages: ocrPages.map((p) => ({ page: p.page, text: p.text })),
          };
          console.log(
            `[upload-extract] OCR'd ${ocrPages.length} scanned notes pages for reference matching`
          );
        } catch (err) {
          console.error('[upload-extract] notes OCR failed:', err);
        } finally {
          await unlink(notesTmp).catch(() => {});
        }
      }

      try {
        notesStoragePrefix = crypto.randomUUID();
        await rasteriseAndUploadNotes(nBuffer, notesStoragePrefix);
      } catch (err) {
        console.error('[upload-extract] notes image upload failed:', err);
        notesStoragePrefix = null;
      }
    }

    // ---- 3) Heuristic parse ----
    let extracted = extractQuestionsFromText(fullText);
    // OCR pipeline extracts richer per-question data (explanation,
    // reference block) that pdf-parse+regex doesn't. Keyed by
    // position in `extracted` so the insert step can pick it up.
    const richExtras = new Map<
      number,
      { explanation?: string; reference?: string; pageNumber?: number }
    >();
    let extractionSource: 'regex' | 'ocr' = 'regex';

    // ---- 4) OCR fallback ----
    // Fires when pdf-parse yielded no matchable text — either the
    // PDF is scanned (image-only) or the layout doesn't match the
    // light regex. Rasterises with pdftocairo, OCRs each page,
    // reparses with the tolerant MCQ parser in lib/ocr.
    if (extracted.length === 0) {
      const tempPath = path.join(
        os.tmpdir(),
        `medz-extract-${jobId}.pdf`
      );
      try {
        await writeFile(tempPath, qBuffer);
        const ocrResult = await processPdf(tempPath, {
          cleanupImages: true,
        });
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
              pageNumber: q.reference?.pageNumber
                ? parseInt(q.reference.pageNumber, 10) || undefined
                : undefined,
            });
            return row;
          });
          extractionSource = 'ocr';
        }
      } catch (err) {
        console.error('[upload-extract] OCR fallback failed:', err);
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    }

    // ---- 5) Reference annotation from notes ----
    // annotateWithReferences preserves any reference already set,
    // so OCR-extracted references win; notes lookup only fills
    // gaps for questions the OCR didn't find a reference for.
    extracted = annotateWithReferences(extracted, notesIndex);

    if (extracted.length === 0) {
      await patchJob({
        status: 'failed',
        error_message:
          'No questions detected. Try a different file or add questions manually.',
        completed_at: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          jobId,
          extracted: 0,
          error:
            'Could not detect any MCQs in that file. Verify the layout uses "1. …" question numbers and "a) …" option letters, or add them manually.',
        },
        { status: 422 }
      );
    }

    // ---- 6) Insert as under_review ----
    // Grab the next subject_bundle_id in bulk to avoid a
    // per-row round-trip.
    const maxRes = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: unknown) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: { subject_bundle_id: number }[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    })
      .from('questions')
      .select('subject_bundle_id')
      .eq('subject_id', subjectId)
      .order('subject_bundle_id', { ascending: false })
      .limit(1);

    let nextBundleId = (maxRes.data?.[0]?.subject_bundle_id ?? 0) + 1;

    const rows = extracted.map((q, i) => {
      const correct =
        q.correctAnswer && q.choices.some((c) => c.id === q.correctAnswer)
          ? q.correctAnswer
          : q.choices[0].id;
      const extras = richExtras.get(i);
      // Resolve the source-notes page number. Priority:
      //   1. OCR-parsed [Reference: … Page N …] from the questions PDF
      //   2. sourcePage from annotateWithReferences (word-overlap match)
      //   3. digits stripped from the reference string itself
      const refPage =
        extras?.pageNumber ??
        q.sourcePage ??
        parseRefPageFromString(q.reference);
      return {
        subject_id: subjectId,
        subject_bundle_id: nextBundleId++,
        question: q.question,
        choices: q.choices,
        correct_answer: correct,
        explanation: extras?.explanation ?? '',
        reference: q.reference ?? extras?.reference ?? '',
        topic: '',
        chapter_id: chapterId,
        professor_id: user.id,
        status: 'under_review',
        source: 'ai',
        difficulty: 'medium',
        notes_storage_prefix: notesStoragePrefix,
        reference_page: refPage,
      };
    });

    const insertRes = await (supabase as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>[]) => {
          select: (c: string) => Promise<{
            data: { id: number }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    })
      .from('questions')
      .insert(rows)
      .select('id');

    if (insertRes.error) {
      await patchJob({
        status: 'failed',
        error_message: insertRes.error.message,
        completed_at: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: insertRes.error.message, jobId },
        { status: 500 }
      );
    }

    await patchJob({
      status: 'completed',
      questions_extracted: rows.length,
      questions_under_review: rows.length,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      jobId,
      extracted: rows.length,
      insertedIds: (insertRes.data ?? []).map((r) => r.id),
      chapterId,
      subjectId,
      extractionSource,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed';
    await patchJob({
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}

// Pull the first integer that looks like a page number out of
// free-form reference strings like "Notes, p. 37" or "Ch 5 p 91".
function parseRefPageFromString(ref: string | undefined): number | null {
  if (!ref) return null;
  const m = ref.match(/[Pp](?:age)?\.?\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Under ~20 chars/page on average = pdf-parse found no real
// text — the PDF is scanned (image-only), so we need OCR to
// build a usable notes index.
function looksScannedIndex(idx: {
  pages: { text: string }[];
}): boolean {
  if (idx.pages.length === 0) return true;
  const total = idx.pages.reduce((n, p) => n + p.text.length, 0);
  return total / idx.pages.length < 20;
}
