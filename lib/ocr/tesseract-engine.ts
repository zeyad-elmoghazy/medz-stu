import Tesseract from 'tesseract.js';

export interface OCRResult {
  pageNumber: number;
  rawText: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

let worker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;

  worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    },
    cachePath: '/tmp/tesseract-cache',
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    tessedit_char_whitelist: '',
    preserve_interword_spaces: '1',
  });

  return worker;
}

export async function ocrImage(
  imagePath: string,
  pageNumber: number
): Promise<OCRResult> {
  const w = await getWorker();
  const result = await w.recognize(imagePath);

  const rawWords = ((result.data as unknown as { words?: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }> }).words) ?? [];

  const words = rawWords.map((word) => ({
    text: word.text,
    confidence: word.confidence,
    bbox: {
      x0: word.bbox.x0,
      y0: word.bbox.y0,
      x1: word.bbox.x1,
      y1: word.bbox.y1,
    },
  }));

  return {
    pageNumber,
    rawText: result.data.text,
    confidence: result.data.confidence,
    words,
  };
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
