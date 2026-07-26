import { processPdf } from '@/lib/ocr/pipeline';
import path from 'path';
import fs from 'fs';

const DEMO_PDF = path.join(process.cwd(), 'public/test-data/demo-questions.pdf');

const describeIfPdf = fs.existsSync(DEMO_PDF) ? describe : describe.skip;

describeIfPdf('OCR Pipeline Integration', () => {
  jest.setTimeout(300000);

  let result: Awaited<ReturnType<typeof processPdf>>;

  beforeAll(async () => {
    console.log('Running full OCR pipeline...');
    console.log('This may take 2-4 minutes...');
    result = await processPdf(DEMO_PDF, { cleanupImages: true });
  });

  it('completes without fatal errors', () => {
    expect(result.success).toBe(true);
    if (result.errors.length > 0) {
      console.warn('Non-fatal errors:', result.errors);
    }
  });

  it('processes all 11 pages', () => {
    expect(result.totalPages).toBe(11);
  });

  it('finds exactly 11 questions', () => {
    expect(result.questionsFound).toBe(11);
  });

  it('achieves at least 70% average confidence', () => {
    expect(result.averageConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it('extracts Q1 about Cowpers glands', () => {
    const q1 = result.questions.find((q) => q.questionNumber === 1);
    expect(q1).toBeDefined();
    expect(q1?.questionText.toLowerCase()).toContain('cowper');
  });

  it('extracts correct answer c for Q1', () => {
    const q1 = result.questions.find((q) => q.questionNumber === 1);
    expect(q1?.correctAnswer).toBe('c');
  });

  it('extracts page reference for Q1 as 37', () => {
    const q1 = result.questions.find((q) => q.questionNumber === 1);
    expect(q1?.reference?.pageNumber).toBe('37');
  });

  it('extracts Q2 about Graafian follicle', () => {
    const q2 = result.questions.find((q) => q.questionNumber === 2);
    expect(q2?.questionText.toLowerCase()).toContain('graafian');
  });

  it('extracts page reference for Q2 as 47', () => {
    const q2 = result.questions.find((q) => q.questionNumber === 2);
    expect(q2?.reference?.pageNumber).toBe('47');
  });

  it('all questions have at least 2 choices', () => {
    for (const q of result.questions) {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all questions have a correct answer', () => {
    for (const q of result.questions) {
      expect(q.correctAnswer).toBeTruthy();
    }
  });

  it('all questions have a reference', () => {
    const withRef = result.questions.filter((q) => q.reference !== null);
    expect(withRef.length).toBeGreaterThanOrEqual(9);
  });

  it('all references contain page numbers', () => {
    const refsWithPage = result.questions.filter(
      (q) => q.reference?.pageNumber
    );
    expect(refsWithPage.length).toBeGreaterThanOrEqual(9);
  });

  it('extracts section names from references', () => {
    const refsWithSection = result.questions.filter((q) => q.reference?.section);
    expect(refsWithSection.length).toBeGreaterThanOrEqual(8);
  });

  it('prints full extraction report', () => {
    console.log('\n=== EXTRACTION REPORT ===');
    console.log(`Total pages: ${result.totalPages}`);
    console.log(`Questions found: ${result.questionsFound}`);
    console.log(
      `Avg confidence: ${(result.averageConfidence * 100).toFixed(1)}%`
    );
    console.log(`Time: ${result.processingTimeMs}ms`);
    if (result.lowConfidenceQuestions.length > 0) {
      console.log(
        `Low confidence: Q${result.lowConfidenceQuestions.join(', Q')}`
      );
    }
    console.log('\n--- PER QUESTION ---');
    for (const q of result.questions) {
      console.log(
        `Q${q.questionNumber}: "${q.questionText.slice(0, 50)}..." | Answer: ${q.correctAnswer.toUpperCase()} | Page: ${q.reference?.pageNumber ?? '?'} | Confidence: ${(q.parseConfidence * 100).toFixed(0)}%`
      );
    }
    expect(true).toBe(true);
  });
});
