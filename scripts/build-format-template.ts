// Builds public/test-data/professor-format-template.pdf — the
// canonical MCQ layout professors must follow. Every rule in this
// document maps one-to-one to a regex in lib/ocr/mcq-parser.ts;
// following it guarantees the AI-authoring pipeline extracts the
// question, choices, correct answer, explanation, per-choice
// rationales, and page reference cleanly.
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const H1 = 22;
const H2 = 14;
const BODY = 11;
const MONO = 10;

function coverPage(doc: PDFKit.PDFDocument) {
  doc.font('Helvetica-Bold').fontSize(H1).text('MedZ — MCQ Upload Format');
  doc.moveDown(0.4);
  doc
    .font('Helvetica')
    .fontSize(BODY)
    .fillColor('#555')
    .text(
      'Follow this format for every question in every PDF you upload to the Professor Dashboard. The AI extractor recognises this layout exactly; deviations are the reason a file returns "Could not detect any MCQs".'
    );
  doc.fillColor('black');

  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(H2).text('The 7 rules');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(BODY);

  const rules: [string, string][] = [
    [
      '1. One question per page.',
      'Start each question on a new page. Do not put two questions on the same page.',
    ],
    [
      '2. Question header: "Q{N}. {stem}"',
      'Begin with a capital Q, the question number, a period, a space, then the stem. End the stem with a colon or a question mark.',
    ],
    [
      '3. Four choices, lowercase letters: "a." "b." "c." "d."',
      'Each choice on its own line. Lowercase letter, period, space, then the text. Up to five choices (a–e) allowed; four is standard.',
    ],
    [
      '4. Answer line: "Answer: {letter}. {full correct text}"',
      'Exact word "Answer" (or "Answers"), colon, correct-choice letter, period, space, then the full text of the correct option.',
    ],
    [
      '5. Explanation line: "Explanation: {paragraph}"',
      'Exact word "Explanation", colon, then one paragraph explaining the correct answer.',
    ],
    [
      '6. Per-choice rationales — one bulleted line per choice.',
      'Use a hyphen "-" bullet, the choice letter with a period, then "WRONG" or "CORRECT" in all caps, an em dash "—" (or hyphen "-"), then the reason.',
    ],
    [
      '7. Reference line — the whole line must be inside square brackets.',
      '[Reference: Dr. {Name}\'s Notes, Page {N}, Section: {Section name}] — page number as a bare integer, section name as free text.',
    ],
  ];

  for (const [rule, detail] of rules) {
    doc.font('Helvetica-Bold').fontSize(BODY).text(rule);
    doc.font('Helvetica').fontSize(BODY).fillColor('#555').text(detail);
    doc.fillColor('black').moveDown(0.4);
  }

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(H2).text('What to avoid');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(BODY);
  const avoid = [
    'Uppercase choice letters like "A." "B." — the parser expects lowercase.',
    'Roman numerals or bullets in place of "a.", "b.", "c." — use letters only.',
    'Multi-column layouts — write single-column, left-aligned.',
    'Scanned images of hand-written questions — printed or typed text only.',
    'Answer key on a separate page — the "Answer:" line must sit under the choices.',
    'Round brackets around the reference block — use square brackets [ ].',
  ];
  for (const a of avoid) {
    doc.text('•  ' + a, { indent: 6, paragraphGap: 2 });
  }
}

function questionPage(
  doc: PDFKit.PDFDocument,
  n: number,
  stem: string,
  choices: string[],
  answerLetter: string,
  explanation: string,
  perChoice: string[],
  refPage: number,
  refSection: string
) {
  doc.font('Courier-Bold').fontSize(BODY + 2).text(`Q${n}. ${stem}`);
  doc.moveDown(0.6);

  doc.font('Courier').fontSize(MONO);
  const letters = ['a', 'b', 'c', 'd', 'e'];
  for (let i = 0; i < choices.length; i++) {
    doc.text(`${letters[i]}. ${choices[i]}`, { paragraphGap: 2 });
  }
  doc.moveDown(0.5);

  const correctText = choices[letters.indexOf(answerLetter)];
  doc.font('Courier-Bold').text(`Answer: ${answerLetter}. ${correctText}`);
  doc.moveDown(0.5);

  doc.font('Courier').text(`Explanation: ${explanation}`);
  doc.moveDown(0.5);

  for (let i = 0; i < perChoice.length; i++) {
    doc.text(`- ${letters[i]}. ${perChoice[i]}`, { paragraphGap: 2 });
  }
  doc.moveDown(0.6);

  doc.text(
    `[Reference: Dr. Ahmed Zahra's Notes, Page ${refPage}, Section: ${refSection}]`
  );
}

async function main() {
  const outDir = path.join(process.cwd(), 'public/test-data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'professor-format-template.pdf');

  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  coverPage(doc);

  doc.addPage();
  doc
    .font('Helvetica-Bold')
    .fontSize(H2)
    .text('Example 1 — correct format (copy this shape)');
  doc.moveDown(0.6);
  questionPage(
    doc,
    1,
    "Cowper's glands are characterized by:",
    [
      'Provides 65% - 75% of seminal fluid',
      'Their duct joins the membranous part of the urethra',
      'They neutralize any traces of acidic urine',
      'Their secretion is rich in fibrinolysin',
    ],
    'c',
    "Cowper's (Bulbo-urethral) glands produce clear mucus secretion that lubricates the penile urethra and neutralizes any traces of acidic urine before the passage of semen.",
    [
      "WRONG - It is the seminal vesicles that give 70-80% of seminal fluid, not Cowper's glands.",
      'WRONG - Their duct joins the initial portion of penile urethra, not the membranous part.',
      'CORRECT - Their function is to lubricate penile urethra and neutralize acidic urine traces.',
      "WRONG - It is the prostate whose secretion is rich in fibrinolysin, not Cowper's glands.",
    ],
    37,
    "The Bulbo-Urethral (Cowper's) Glands"
  );

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(H2).text('Example 2 — correct format');
  doc.moveDown(0.6);
  questionPage(
    doc,
    2,
    'Which of the following characterizes the mature Graafian follicle?',
    [
      'Theca interna cells can differentiate into smooth muscle cells',
      'Gap junctions are present in the perivitelline space',
      'Corona radiata is a single layer of flat cells',
      'Theca externa secrete androgen',
    ],
    'b',
    'In the mature Graafian follicle, corona radiata cells send cytoplasmic processes that penetrate zona pellucida and contact oocyte microvilli via gap junctions in the perivitelline space.',
    [
      'WRONG - Theca interna cells secrete androgen and do not differentiate into smooth muscle.',
      'CORRECT - Gap junctions sit in the perivitelline space between corona radiata and oocyte.',
      'WRONG - Corona radiata is a single layer of columnar granulosa cells, not flat cells.',
      'WRONG - It is theca interna that secretes androgen; theca externa has no secretory role.',
    ],
    47,
    'Mature Graafian (Tertiary) Follicles'
  );

  doc.addPage();
  doc
    .font('Helvetica-Bold')
    .fontSize(H2)
    .text('Example 3 — every field filled the same way');
  doc.moveDown(0.6);
  questionPage(
    doc,
    3,
    'The blood-testis barrier is formed by:',
    [
      'Tight junctions between Leydig cells',
      'Tight junctions between adjacent Sertoli cells',
      'The basement membrane of seminiferous tubules alone',
      'Peritubular myoid cells',
    ],
    'b',
    'Sertoli cells are linked by occluding tight junctions that split the seminiferous epithelium into basal and adluminal compartments — the blood-testis barrier.',
    [
      'WRONG - Leydig cells lie in the interstitium and do not form the barrier.',
      'CORRECT - Sertoli-Sertoli tight junctions form the barrier.',
      'WRONG - The basement membrane alone is not sufficient to isolate germ cells.',
      'WRONG - Myoid cells assist tubule contraction but do not form the barrier.',
    ],
    21,
    'Seminiferous Tubules & Blood-Testis Barrier'
  );

  doc.addPage();
  doc
    .font('Helvetica-Bold')
    .fontSize(H2)
    .text('Wrong: this is what NOT to do');
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(BODY).fillColor('#8a1a1a');
  doc.text(
    'The following block will FAIL extraction — no "Q" prefix, uppercase choice letters, "Correct answer" instead of "Answer:", and round brackets around the reference. Do not use it.'
  );
  doc.fillColor('black').moveDown(0.6);
  doc.font('Courier').fontSize(MONO).fillColor('#333');
  doc.text('1) What is the functional unit of the kidney');
  doc.text('   A) The renal lobule');
  doc.text('   B) The nephron');
  doc.text('   C) The medullary pyramid');
  doc.text('   D) The collecting duct');
  doc.text('   Correct answer is B');
  doc.text("   (Ref: Dr. Zahra's Notes, p150)");
  doc.fillColor('black');

  doc.end();
  await new Promise<void>((res) => stream.on('finish', () => res()));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
