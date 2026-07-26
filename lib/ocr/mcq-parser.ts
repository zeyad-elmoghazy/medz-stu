export interface ParsedChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface ParsedReference {
  fullText: string;
  pageNumber: string;
  section: string;
  professorName: string;
}

export interface ParsedQuestion {
  questionNumber: number;
  questionText: string;
  choices: ParsedChoice[];
  correctAnswer: string;
  correctAnswerText: string;
  explanation: string;
  reference: ParsedReference | null;
  rawText: string;
  parseConfidence: number;
  warnings: string[];
}

function cleanText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Accepts Q1., Q 1., Q1), 1., 1), (1), and OCR variants where
// the digit came back as "l" (lowercase L) or "O" (letter O) —
// but only inside the Q-prefixed form, so plain sentences that
// start "1 ..." aren't misread as questions.
const QUESTION_START = /(?:^|\n)\s*(?:Q\s*([\dlOo]+)|\(?\s*(\d+)\s*\))\s*[.):]\s+/g;

function normaliseQNum(raw: string): number {
  // parseInt stops at the first non-digit, so "11l" → 11 for free.
  const direct = parseInt(raw, 10);
  if (Number.isFinite(direct)) return direct;
  // Strip leading letter noise before substituting. Tesseract often
  // renders "Q11." as "Ql11." — the "l" is a phantom letter, not
  // digit-shaped noise, so we drop it before parsing.
  const stripped = raw.replace(/^[lIOo]+/, '');
  const s = parseInt(stripped, 10);
  if (Number.isFinite(s)) return s;
  // Last resort: whole-word letter → digit substitution
  // for pure "Ql" → 1, "QO" → 0 cases.
  const cleaned = raw.replace(/l/g, '1').replace(/[Oo]/g, '0');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseOCRText(
  rawText: string,
  _pageNumber: number
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  const blocks: Array<{ number: number; startIndex: number; text: string }> = [];
  QUESTION_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUESTION_START.exec(rawText)) !== null) {
    const num = normaliseQNum(m[1] || m[2] || '0');
    if (num > 0) {
      blocks.push({ number: num, startIndex: m.index, text: '' });
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].startIndex;
    const end = blocks[i + 1]?.startIndex ?? rawText.length;
    blocks[i].text = rawText.slice(start, end).trim();
  }

  for (const block of blocks) {
    const parsed = parseQuestionBlock(block.text, block.number);
    if (parsed) questions.push(parsed);
  }

  return questions;
}

function parseQuestionBlock(
  text: string,
  questionNumber: number
): ParsedQuestion | null {
  const warnings: string[] = [];

  // Question stem: from after the "Q{n}." prefix up to (but not
  // including) the first "a." style choice on its own line.
  const questionMatch = text.match(
    /^\s*(?:Q\s*[\dlOo]+|\(?\s*\d+\s*\)?)[.):]\s*([\s\S]+?)(?=\n\s*[a-e][.),:]\s)/i
  );

  if (!questionMatch) return null;
  const questionText = cleanText(questionMatch[1]);

  // Choices: allow ., ), , or : after the letter (all common
  // OCR renderings) and terminate at the next choice, an
  // "Answer:" line, or the "[Reference" block.
  const choicePattern =
    /\n\s*([a-e])[.),:]\s+([\s\S]+?)(?=\n\s*[a-e][.),:]\s|\n\s*Answers?\s*:|\n\s*Explanation\b|\n\s*[\[({]\s*Reference\b|$)/gi;
  const choices: ParsedChoice[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = choicePattern.exec(text)) !== null) {
    const id = cm[1].toLowerCase();
    if (choices.some((c) => c.id === id)) continue;
    choices.push({ id, text: cleanText(cm[2]), isCorrect: false, explanation: '' });
  }

  if (choices.length < 2) warnings.push(`Only ${choices.length} choices found`);

  // "Answer:" / "Answers:" tolerated; both "c." and "c)" tolerated.
  const answerMatch = text.match(
    /Answers?\s*:?\s*([a-e])[.)]\s*([\s\S]+?)(?=\n\s*Explanation\b|\n\s*[\[({]\s*Reference\b|\n\s*[•·*\-]\s*[a-e][.)]\s|$)/i
  );

  let correctLetter = '';
  let correctAnswerText = '';
  if (answerMatch) {
    correctLetter = answerMatch[1].toLowerCase();
    correctAnswerText = cleanText(answerMatch[2]);
    const correctChoice = choices.find((c) => c.id === correctLetter);
    if (correctChoice) correctChoice.isCorrect = true;
    else warnings.push(`Correct answer '${correctLetter}' not found in choices`);
  } else {
    warnings.push('No answer line found');
  }

  const explanationMatch = text.match(
    /Explanation\s*:?\s*([\s\S]+?)(?=\n\s*[•·*\-]\s*[a-e][.)]\s|\n\s*[\[({]\s*Reference\b|$)/i
  );
  const explanation = explanationMatch ? cleanText(explanationMatch[1]) : '';

  // Per-choice explanations: "- a. WRONG — ..." / "- c. CORRECT — ..."
  const choiceExplPattern =
    /[•·*\-]\s*([a-e])[.)]\s*(WRONG|CORRECT)\s*[—–\-]\s*([\s\S]+?)(?=\n\s*[•·*\-]\s*[a-e][.)]\s|\n\s*[\[({]\s*Reference\b|$)/gi;
  let em: RegExpExecArray | null;
  while ((em = choiceExplPattern.exec(text)) !== null) {
    const id = em[1].toLowerCase();
    const expl = cleanText(em[3]);
    const choice = choices.find((c) => c.id === id);
    if (choice) choice.explanation = expl;
  }

  const reference = extractReference(text);

  let confidence = 1.0;
  if (!questionText) confidence -= 0.4;
  if (choices.length < 4) confidence -= 0.2;
  if (!correctLetter) confidence -= 0.2;
  if (!explanation) confidence -= 0.1;
  if (!reference) confidence -= 0.1;

  return {
    questionNumber,
    questionText,
    choices,
    correctAnswer: correctLetter,
    correctAnswerText,
    explanation,
    reference,
    rawText: text,
    parseConfidence: Math.max(0, confidence),
    warnings,
  };
}

function extractReference(text: string): ParsedReference | null {
  // Bracket forms Tesseract commonly produces: [ ] ( ) { }.
  const refPattern = /[\[({]\s*Reference\s*:?\s*([\s\S]+?)[\])}]/i;
  const match = text.match(refPattern);
  if (!match) return null;

  const fullText = match[0];
  const inner = match[1];

  const pageMatch = inner.match(/[Pp]ages?\s*[.:]?\s*(\d+)/);
  const pageNumber = pageMatch ? pageMatch[1] : '';

  // Section runs to end of the bracket block — OCR often
  // introduces a spurious "," inside the section itself (e.g.
  // "Theca Interna & Theca Externa"), so we stop at "]" only.
  const sectionMatch = inner.match(/[Ss]ection\s*:?\s*([\s\S]+?)$/);
  const section = sectionMatch ? cleanText(sectionMatch[1]) : '';

  const profMatch = inner.match(/(Dr\.?\s*[A-Z][a-z]+\s+[A-Z][a-z]+)/);
  const professorName = profMatch ? profMatch[1] : 'Dr. Ahmed Zahra';

  return {
    fullText: cleanText(fullText),
    pageNumber,
    section,
    professorName,
  };
}

export { parseQuestionBlock, extractReference, cleanText };
