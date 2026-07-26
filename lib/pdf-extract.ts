/**
 * PDF extraction helpers — pdf-parse first (free, deterministic),
 * regex MCQ parser second (free), LLM fallback third (paid,
 * only called when the heuristic finds nothing).
 *
 * Cost model:
 *   text-based PDFs → 0 API calls, sub-second latency
 *   scanned PDFs    → tesseract.js OCR on the client
 *                     (TODO: not yet wired — see NOTE below)
 *   messy layouts   → 1 LLM call over the extracted text only,
 *                     never the raw PDF bytes
 *
 * NOTE — client-side OCR:
 *   Real scanned-PDF OCR belongs on the client (tesseract.js in
 *   a Web Worker) so the professor's laptop does the CPU work
 *   and the server never touches image bytes. This module can
 *   also accept a pre-OCR'd text string via extractQuestionsFromText().
 *   Add the tesseract.js path in the UploadWizard when demand
 *   justifies the +8 MB bundle cost.
 */

// pdf-parse v2 is a class-based API — new PDFParse({data}).getText()
// returns { pages: [{ num, text }], text, total }. Dynamic import
// so the pdfjs-dist ESM shim never touches the module graph at
// build time (that shim throws under webpack's CJS bootstrap).
type PageTextResult = { num: number; text: string };
type TextResult = { pages: PageTextResult[]; text: string; total: number };
type PdfParseCtor = new (opts: {
  data: Uint8Array | Buffer;
  verbosity?: number;
}) => {
  getText(): Promise<TextResult>;
  destroy(): Promise<void>;
};

async function loadPdfParse(): Promise<PdfParseCtor> {
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse?: PdfParseCtor;
    default?: { PDFParse?: PdfParseCtor };
  };
  const ctor = mod.PDFParse ?? mod.default?.PDFParse;
  if (!ctor) throw new Error('pdf-parse: PDFParse constructor not found');
  return ctor;
}

export type ExtractedQuestion = {
  question: string;
  choices: { id: string; text: string }[];
  correctAnswer?: string;
  reference?: string;
  sourcePage?: number;
};

export type NotesIndex = {
  totalPages: number;
  pages: { page: number; text: string }[];
};

/**
 * Extract text from a PDF, page by page. The v2 API returns
 * per-page results directly — no pagerender hook needed.
 */
export async function extractPdfPages(
  buffer: Buffer
): Promise<{ totalPages: number; pages: { page: number; text: string }[] }> {
  const PDFParse = await loadPdfParse();
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    verbosity: 0,
  });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((p) => ({
      page: p.num,
      text: (p.text ?? '').replace(/\s+/g, ' ').trim(),
    }));
    return { totalPages: result.total ?? pages.length, pages };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Heuristic MCQ parser — matches "1. Question ... a) ... b) ..."
 * shapes common in student question banks. No LLM.
 *
 * Recognises:
 *   Q1. / 1. / (1) / Question 1: as question start
 *   a) / a. / A. / (a) as option start
 *   Answer: c / Correct answer: c
 *   Ref: page 34 / Reference: Ch 5 p. 91
 */
export function extractQuestionsFromText(text: string): ExtractedQuestion[] {
  const normalised = text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  // Split into candidate question blocks. Look for lines that
  // begin a new numbered question — everything until the next
  // numbered start (or end of doc) is one block.
  const blockRegex =
    /(?:^|\n)(?:Q(?:uestion)?\s*)?(\d{1,3})[\.\)]\s+([\s\S]*?)(?=(?:\n(?:Q(?:uestion)?\s*)?\d{1,3}[\.\)]\s)|$)/gi;

  const out: ExtractedQuestion[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(normalised)) !== null) {
    const body = match[2].trim();
    const parsed = parseBlock(body);
    if (parsed && parsed.choices.length >= 2 && parsed.question.length >= 8) {
      out.push(parsed);
    }
  }
  return out;
}

function parseBlock(body: string): ExtractedQuestion | null {
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const optionRegex = /^\(?([a-eA-E])[\.\)]\s+(.+)$/;
  const answerRegex = /^(?:Answer|Correct(?:\s+answer)?|Ans)[:.\s]+\(?([a-eA-E])/i;
  const refRegex = /^(?:Ref(?:erence)?|Source)[:.\s]+(.+)$/i;

  let question = '';
  const choices: { id: string; text: string }[] = [];
  let correctAnswer: string | undefined;
  let reference: string | undefined;

  for (const line of lines) {
    const opt = line.match(optionRegex);
    const ans = line.match(answerRegex);
    const ref = line.match(refRegex);
    if (ans) {
      correctAnswer = ans[1].toLowerCase();
    } else if (ref) {
      reference = ref[1].trim();
    } else if (opt) {
      choices.push({ id: opt[1].toLowerCase(), text: opt[2].trim() });
    } else if (choices.length === 0) {
      // Still building the question stem.
      question = question ? `${question} ${line}` : line;
    } else {
      // Continuation of the previous choice.
      const last = choices[choices.length - 1];
      last.text = `${last.text} ${line}`;
    }
  }

  question = question.replace(/\s+/g, ' ').trim();
  if (!question || choices.length < 2) return null;

  return { question, choices, correctAnswer, reference };
}

/**
 * Build a per-page notes index for reference-page lookups.
 * We just keep the full text per page; the caller runs simple
 * substring scans to find which page a question stem lives on.
 */
export async function buildNotesIndex(buffer: Buffer): Promise<NotesIndex> {
  const { totalPages, pages } = await extractPdfPages(buffer);
  return { totalPages, pages };
}

/**
 * For each extracted question, find the notes page whose text
 * best matches the question stem. Scoring is trivial word
 * overlap — good enough for citation, and free.
 */
export function annotateWithReferences(
  questions: ExtractedQuestion[],
  notes: NotesIndex | null
): ExtractedQuestion[] {
  if (!notes) return questions;

  return questions.map((q) => {
    if (q.reference) return q;
    const stemWords = tokenise(q.question);
    if (stemWords.length === 0) return q;

    let bestPage = 0;
    let bestScore = 0;
    for (const p of notes.pages) {
      const pageWords = new Set(tokenise(p.text));
      let score = 0;
      for (const w of stemWords) if (pageWords.has(w)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestPage = p.page;
      }
    }
    // Require a minimum match to avoid spurious citations.
    if (bestScore >= Math.max(3, Math.floor(stemWords.length / 3))) {
      return { ...q, reference: `Notes, p. ${bestPage}`, sourcePage: bestPage };
    }
    return q;
  });
}

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  'about',
  'above',
  'after',
  'again',
  'against',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'during',
  'each',
  'from',
  'further',
  'having',
  'into',
  'more',
  'most',
  'other',
  'over',
  'same',
  'some',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'until',
  'very',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
  'have',
  'has',
  'was',
  'will',
]);
