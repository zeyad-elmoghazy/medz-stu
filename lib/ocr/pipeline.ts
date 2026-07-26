import { convertPdfToImages, preprocessImage } from './pdf-to-images';
import { ocrImage, terminateWorker } from './tesseract-engine';
import { parseOCRText, type ParsedQuestion } from './mcq-parser';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface PipelineResult {
  success: boolean;
  totalPages: number;
  questionsFound: number;
  questions: ParsedQuestion[];
  averageConfidence: number;
  lowConfidenceQuestions: number[];
  processingTimeMs: number;
  errors: string[];
}

export interface OcrPage {
  page: number;
  text: string;
  confidence: number;
}

// Rasterise + preprocess + OCR a PDF and return per-page text.
// The MCQ parser is NOT applied — callers that want structured
// questions use processPdf(), callers that just need text (e.g.
// building a notes index for reference-page matching) use this.
export async function ocrPdfToPages(pdfPath: string): Promise<OcrPage[]> {
  const tempDir = path.join(os.tmpdir(), `medz-ocr-pages-${Date.now()}`);
  try {
    const pageImages = await convertPdfToImages(pdfPath, tempDir);
    const processed = await Promise.all(
      pageImages.map(async (p) => {
        try {
          return { ...p, imagePath: await preprocessImage(p.imagePath) };
        } catch {
          return p;
        }
      })
    );
    const out: OcrPage[] = [];
    for (const p of processed) {
      const r = await ocrImage(p.imagePath, p.pageNumber);
      out.push({ page: p.pageNumber, text: r.rawText, confidence: r.confidence });
    }
    return out;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function processPdf(
  pdfPath: string,
  options: {
    subjectId?: string;
    professorId?: string;
    cleanupImages?: boolean;
  } = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const allQuestions: ParsedQuestion[] = [];

  const tempDir = path.join(os.tmpdir(), `medz-ocr-${Date.now()}`);

  console.log(`OCR Pipeline starting for: ${pdfPath}`);

  try {
    console.log('Phase 1: Converting PDF to images...');
    let pageImages;
    try {
      pageImages = await convertPdfToImages(pdfPath, tempDir);
      console.log(`Converted ${pageImages.length} pages`);
    } catch (err) {
      errors.push(`PDF conversion failed: ${err}`);
      return {
        success: false,
        totalPages: 0,
        questionsFound: 0,
        questions: [],
        averageConfidence: 0,
        lowConfidenceQuestions: [],
        processingTimeMs: Date.now() - startTime,
        errors,
      };
    }

    console.log('Phase 2: Preprocessing images...');
    const processedImages = await Promise.all(
      pageImages.map(async (page) => {
        try {
          const processed = await preprocessImage(page.imagePath);
          return { ...page, imagePath: processed };
        } catch {
          return page;
        }
      })
    );

    console.log('Phase 3: Running OCR...');
    const ocrResults = [];
    for (const page of processedImages) {
      try {
        console.log(
          `OCR page ${page.pageNumber}/${processedImages.length}...`
        );
        const result = await ocrImage(page.imagePath, page.pageNumber);
        ocrResults.push(result);
        console.log(
          `Page ${page.pageNumber}: ${result.confidence.toFixed(1)}% confidence`
        );
      } catch (err) {
        errors.push(`OCR failed on page ${page.pageNumber}: ${err}`);
      }
    }

    console.log('Phase 4: Parsing MCQ structure...');
    const combinedText = ocrResults
      .map((r) => r.rawText)
      .join('\n\n--- PAGE BREAK ---\n\n');

    const parsedQuestions = parseOCRText(combinedText, 0);
    allQuestions.push(...parsedQuestions);

    console.log(`Found ${allQuestions.length} questions`);

    // When parsing yields nothing but OCR clearly produced text,
    // dump the raw combined text so we can see what format the
    // source PDF actually uses and update the parser.
    if (allQuestions.length === 0 && combinedText.trim().length > 0) {
      const dumpPath = path.join(
        os.tmpdir(),
        `medz-ocr-dump-${Date.now()}.txt`
      );
      try {
        await fs.writeFile(dumpPath, combinedText, 'utf8');
        console.log(
          `[ocr] parser found 0 questions; wrote raw OCR text to ${dumpPath} (${combinedText.length} chars)`
        );
      } catch (err) {
        console.warn('[ocr] failed to write diagnostic dump:', err);
      }
    }

    for (const q of allQuestions) {
      if (q.warnings.length > 0) {
        console.warn(`Q${q.questionNumber} warnings:`, q.warnings);
      }
    }

    const avgConfidence =
      allQuestions.length > 0
        ? allQuestions.reduce((sum, q) => sum + q.parseConfidence, 0) /
          allQuestions.length
        : 0;

    const lowConfidence = allQuestions
      .filter((q) => q.parseConfidence < 0.7)
      .map((q) => q.questionNumber);

    return {
      success: errors.length === 0,
      totalPages: pageImages.length,
      questionsFound: allQuestions.length,
      questions: allQuestions,
      averageConfidence: avgConfidence,
      lowConfidenceQuestions: lowConfidence,
      processingTimeMs: Date.now() - startTime,
      errors,
    };
  } finally {
    await terminateWorker();
    if (options.cleanupImages !== false) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // non-fatal
      }
    }
  }
}
