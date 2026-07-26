import {
  parseOCRText,
  extractReference,
  cleanText,
} from '@/lib/ocr/mcq-parser';

describe('MCQ Parser', () => {
  const SAMPLE_Q1 = `Q1. Cowper's glands are characterized by:

a. Provides 65% - 75% of seminal fluid
b. Their duct joins the membranous part of the urethra
c. They neutralize any traces of acidic urine
d. Their secretion is rich in fibrinolysin

Answer: c. They neutralize any traces of acidic urine

Explanation: Cowper's (Bulbo-urethral) glands produce clear mucus secretion that serves to lubricate penile urethra & neutralize any traces of acidic urine.

- a. WRONG — It is the seminal vesicles that give 70-80% of seminal fluid, not Cowper's glands.
- b. WRONG — Their duct joins the initial portion of penile urethra, not the membranous part.
- c. CORRECT — Their function is to lubricate penile urethra and neutralize acidic urine traces.
- d. WRONG — It is the prostate whose secretion is rich in fibrinolysin, not Cowper's glands.

[Reference: Dr. Ahmed Zahra's Notes, Page 37, Section: The Bulbo-Urethral (Cowper's) Glands]`;

  const SAMPLE_Q2 = `Q2. Which of the following characterizes the mature Graafian follicle?

a. Theca interna cells can differentiate into smooth muscle cells
b. Gap junctions are present in the perivitelline space
c. Corona radiata is a single layer of flat cells
d. Theca externa secrete androgen

Answer: b. Gap junctions are present in the perivitelline space

Explanation: In the mature Graafian follicle, the corona radiata cells send cytoplasmic processes that penetrate zona pellucida to make contact with microvilli projecting from the oocyte via gap junctions in the perivitelline space to allow passage of ions, metabolites & other substances to oocyte.

- a. WRONG — Theca interna cells secrete androgen and do not differentiate into smooth muscle cells.
- b. CORRECT — Gap junctions are present in the perivitelline space between corona radiata processes and oocyte microvilli.
- c. WRONG — Corona radiata is a single layer of granulosa cells acquiring columnar shape, not flat cells.
- d. WRONG — It is the theca interna that secretes androgen. Theca externa has no secretory function.

[Reference: Dr. Ahmed Zahra's Notes, Page 47, Section: Mature Graafian (Tertiary) Follicles — Corona Radiata & Theca Interna & Theca Externa]`;

  describe('Question text extraction', () => {
    it('extracts question text for Q1', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results).toHaveLength(1);
      expect(results[0].questionText).toContain(
        "Cowper's glands are characterized by"
      );
    });
    it('extracts question number correctly', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].questionNumber).toBe(1);
    });
    it('handles multi-line question text', () => {
      const results = parseOCRText(SAMPLE_Q2, 1);
      expect(results[0].questionText).toContain('mature Graafian follicle');
    });
  });

  describe('Answer choices extraction', () => {
    it('extracts exactly 4 choices for Q1', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].choices).toHaveLength(4);
    });
    it('extracts choice IDs a, b, c, d', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const ids = results[0].choices.map((c) => c.id);
      expect(ids).toEqual(['a', 'b', 'c', 'd']);
    });
    it('extracts choice text correctly', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const choiceA = results[0].choices.find((c) => c.id === 'a');
      expect(choiceA?.text).toContain('seminal fluid');
    });
    it('marks correct choice as isCorrect', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const correctChoice = results[0].choices.find((c) => c.isCorrect);
      expect(correctChoice?.id).toBe('c');
    });
    it('does not mark wrong choices as correct', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const wrongChoices = results[0].choices.filter((c) => !c.isCorrect);
      expect(wrongChoices).toHaveLength(3);
    });
  });

  describe('Correct answer extraction', () => {
    it('identifies correct answer letter for Q1', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].correctAnswer).toBe('c');
    });
    it('identifies correct answer letter for Q2', () => {
      const results = parseOCRText(SAMPLE_Q2, 1);
      expect(results[0].correctAnswer).toBe('b');
    });
    it('extracts correct answer text', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].correctAnswerText).toContain('neutralize');
    });
  });

  describe('Explanation extraction', () => {
    it('extracts explanation paragraph', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].explanation).toContain('Bulbo-urethral');
    });
    it('explanation is non-empty', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].explanation.length).toBeGreaterThan(20);
    });
  });

  describe('Per-choice explanation extraction', () => {
    it('extracts WRONG explanation for choice a', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const choiceA = results[0].choices.find((c) => c.id === 'a');
      expect(choiceA?.explanation).toContain('seminal vesicles');
    });
    it('extracts CORRECT explanation for choice c', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      const choiceC = results[0].choices.find((c) => c.id === 'c');
      expect(choiceC?.explanation).toContain('lubricate');
    });
  });

  describe('Reference extraction', () => {
    it('extracts reference block', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].reference).not.toBeNull();
    });
    it('extracts page number from reference', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].reference?.pageNumber).toBe('37');
    });
    it('extracts page 47 for Q2', () => {
      const results = parseOCRText(SAMPLE_Q2, 1);
      expect(results[0].reference?.pageNumber).toBe('47');
    });
    it('extracts section name', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].reference?.section).toContain('Bulbo-Urethral');
    });
    it('extracts professor name', () => {
      const results = parseOCRText(SAMPLE_Q1, 1);
      expect(results[0].reference?.professorName).toContain('Ahmed Zahra');
    });
    it('handles multi-line section in reference', () => {
      const results = parseOCRText(SAMPLE_Q2, 1);
      expect(results[0].reference?.section).toContain('Graafian');
    });
  });

  describe('Multiple question parsing', () => {
    const COMBINED = SAMPLE_Q1 + '\n\n' + SAMPLE_Q2;
    it('parses two questions from combined text', () => {
      const results = parseOCRText(COMBINED, 1);
      expect(results).toHaveLength(2);
    });
    it('assigns correct question numbers', () => {
      const results = parseOCRText(COMBINED, 1);
      expect(results[0].questionNumber).toBe(1);
      expect(results[1].questionNumber).toBe(2);
    });
    it('does not mix up choices between questions', () => {
      const results = parseOCRText(COMBINED, 1);
      expect(results[0].correctAnswer).toBe('c');
      expect(results[1].correctAnswer).toBe('b');
    });
  });

  describe('OCR error resilience', () => {
    it('handles "Ql" instead of "Q1" (l vs 1)', () => {
      const garbled = SAMPLE_Q1.replace('Q1.', 'Ql.');
      const results = parseOCRText(garbled, 1);
      expect(results.length).toBeGreaterThan(0);
    });
    it('handles missing dots in choice letters', () => {
      const garbled = SAMPLE_Q1.replace('a.', 'a)').replace('b.', 'b)');
      const results = parseOCRText(garbled, 1);
      expect(results[0].choices.length).toBeGreaterThanOrEqual(2);
    });
    it('handles "Answers:" instead of "Answer:"', () => {
      const garbled = SAMPLE_Q1.replace('Answer:', 'Answers:');
      const results = parseOCRText(garbled, 1);
      expect(results[0].correctAnswer).toBe('c');
    });
    it('handles extra whitespace in text', () => {
      const garbled = SAMPLE_Q1.replace(/\n/g, '\n  ');
      const results = parseOCRText(garbled, 1);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('cleanText helper', () => {
    it('normalises multiple spaces', () => {
      expect(cleanText('hello   world')).toBe('hello world');
    });
    it('removes leading and trailing whitespace', () => {
      expect(cleanText('  hello  ')).toBe('hello');
    });
    it('normalises curly quotes', () => {
      expect(cleanText('“hello”')).toBe('"hello"');
    });
  });

  describe('extractReference (direct)', () => {
    it('handles paren-style brackets from OCR', () => {
      const ref = extractReference(
        "(Reference: Dr. Ahmed Zahra's Notes, Page 12, Section: The Testis)"
      );
      expect(ref?.pageNumber).toBe('12');
      expect(ref?.section).toContain('Testis');
    });
    it('returns null when no reference block present', () => {
      expect(extractReference('no reference here')).toBeNull();
    });
  });
});
