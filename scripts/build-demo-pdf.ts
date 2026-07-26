/* eslint-disable @typescript-eslint/no-var-requires */
// Build public/test-data/demo-questions.pdf — an 11-page MCQ
// fixture matching Dr. Ahmed Zahra's format, used by the OCR
// integration test in __tests__/ocr/pipeline.integration.test.ts.
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface Question {
  n: number;
  stem: string;
  choices: string[]; // 4 items, a..d
  answerLetter: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  perChoice: [string, string, string, string]; // WRONG/CORRECT + reason
  refPage: number;
  refSection: string;
}

const QUESTIONS: Question[] = [
  {
    n: 1,
    stem: "Cowper's glands are characterized by:",
    choices: [
      'Provides 65% - 75% of seminal fluid',
      'Their duct joins the membranous part of the urethra',
      'They neutralize any traces of acidic urine',
      'Their secretion is rich in fibrinolysin',
    ],
    answerLetter: 'c',
    explanation:
      "Cowper's (Bulbo-urethral) glands produce clear mucus secretion that serves to lubricate the penile urethra and neutralize any traces of acidic urine before the passage of semen.",
    perChoice: [
      "WRONG - It is the seminal vesicles that give 70-80% of seminal fluid, not Cowper's glands.",
      'WRONG - Their duct joins the initial portion of penile urethra, not the membranous part.',
      'CORRECT - Their function is to lubricate penile urethra and neutralize acidic urine traces.',
      "WRONG - It is the prostate whose secretion is rich in fibrinolysin, not Cowper's glands.",
    ],
    refPage: 37,
    refSection: "The Bulbo-Urethral (Cowper's) Glands",
  },
  {
    n: 2,
    stem: 'Which of the following characterizes the mature Graafian follicle?',
    choices: [
      'Theca interna cells can differentiate into smooth muscle cells',
      'Gap junctions are present in the perivitelline space',
      'Corona radiata is a single layer of flat cells',
      'Theca externa secrete androgen',
    ],
    answerLetter: 'b',
    explanation:
      'In the mature Graafian follicle, corona radiata cells send cytoplasmic processes that penetrate zona pellucida and contact oocyte microvilli via gap junctions in the perivitelline space.',
    perChoice: [
      'WRONG - Theca interna cells secrete androgen and do not differentiate into smooth muscle.',
      'CORRECT - Gap junctions sit in the perivitelline space between corona radiata and oocyte.',
      'WRONG - Corona radiata is a single layer of columnar granulosa cells, not flat cells.',
      'WRONG - It is theca interna that secretes androgen; theca externa has no secretory role.',
    ],
    refPage: 47,
    refSection: 'Mature Graafian (Tertiary) Follicles',
  },
  {
    n: 3,
    stem: 'The blood-testis barrier is formed by:',
    choices: [
      'Tight junctions between Leydig cells',
      'Tight junctions between adjacent Sertoli cells',
      'Basement membrane of seminiferous tubules alone',
      'Peritubular myoid cells',
    ],
    answerLetter: 'b',
    explanation:
      'Sertoli cells are linked by occluding tight junctions that split the seminiferous epithelium into basal and adluminal compartments — the blood-testis barrier.',
    perChoice: [
      'WRONG - Leydig cells lie in the interstitium and do not form the barrier.',
      'CORRECT - Sertoli-Sertoli tight junctions form the barrier.',
      'WRONG - The basement membrane alone is not sufficient to isolate germ cells.',
      'WRONG - Myoid cells assist tubule contraction but do not form the barrier.',
    ],
    refPage: 21,
    refSection: 'Seminiferous Tubules & Blood-Testis Barrier',
  },
  {
    n: 4,
    stem: 'Which cell type in the anterior pituitary secretes ACTH?',
    choices: ['Somatotrophs', 'Corticotrophs', 'Thyrotrophs', 'Gonadotrophs'],
    answerLetter: 'b',
    explanation:
      'Corticotrophs in the pars distalis produce ACTH (adrenocorticotropic hormone) from proopiomelanocortin.',
    perChoice: [
      'WRONG - Somatotrophs secrete growth hormone.',
      'CORRECT - Corticotrophs secrete ACTH.',
      'WRONG - Thyrotrophs secrete TSH.',
      'WRONG - Gonadotrophs secrete FSH and LH.',
    ],
    refPage: 88,
    refSection: 'Anterior Pituitary Cell Types',
  },
  {
    n: 5,
    stem: 'Kupffer cells are:',
    choices: [
      'Sinusoidal endothelial cells',
      'Fixed macrophages of the liver sinusoids',
      'Hepatocytes in zone 1',
      'Vitamin-A storing cells of the space of Disse',
    ],
    answerLetter: 'b',
    explanation:
      'Kupffer cells are stellate mononuclear-phagocyte-system macrophages resident in hepatic sinusoids; they clear senescent RBCs, endotoxins and microbes.',
    perChoice: [
      'WRONG - Sinusoidal endothelium is a distinct cell type.',
      'CORRECT - Kupffer cells are the fixed macrophages of the sinusoids.',
      'WRONG - Zone 1 hepatocytes are parenchymal cells, not macrophages.',
      'WRONG - Vitamin-A storage is done by Ito (hepatic stellate) cells.',
    ],
    refPage: 105,
    refSection: 'The Liver Sinusoids and Kupffer Cells',
  },
  {
    n: 6,
    stem: 'Type I alveolar cells (pneumocytes) are characterized by:',
    choices: [
      'Cuboidal shape with surfactant granules',
      'Simple squamous cells forming the gas-exchange surface',
      'Ciliated columnar epithelium',
      'Goblet cells producing mucin',
    ],
    answerLetter: 'b',
    explanation:
      'Type I pneumocytes are thin squamous cells that cover ~95% of the alveolar surface and are the primary site of gas exchange.',
    perChoice: [
      'WRONG - Cuboidal cells with surfactant granules describe type II pneumocytes.',
      'CORRECT - Type I are simple squamous, providing the thin gas-exchange surface.',
      'WRONG - Ciliated columnar epithelium lines the airways, not alveoli.',
      'WRONG - Goblet cells are found in bronchi and larger airways.',
    ],
    refPage: 132,
    refSection: 'Alveolar Epithelium (Pneumocytes Type I and II)',
  },
  {
    n: 7,
    stem: 'The functional unit of the kidney is:',
    choices: [
      'The renal lobule',
      'The nephron',
      'The medullary pyramid',
      'The collecting duct',
    ],
    answerLetter: 'b',
    explanation:
      'The nephron — glomerulus plus its tubule (PCT, loop of Henle, DCT) — is the histophysiological functional unit of the kidney.',
    perChoice: [
      'WRONG - The lobule is an anatomical subdivision, not the functional unit.',
      'CORRECT - The nephron is the functional unit.',
      'WRONG - The pyramid contains many nephrons but is not itself the unit.',
      'WRONG - Collecting ducts drain many nephrons; they are not the unit.',
    ],
    refPage: 150,
    refSection: 'The Uriniferous Tubule: Nephron and Collecting Duct',
  },
  {
    n: 8,
    stem: 'Which of the following is characteristic of ceruminous glands?',
    choices: [
      'Merocrine sweat glands',
      'Modified apocrine glands of the external auditory meatus',
      'Sebaceous glands of the eyelid',
      'Endocrine glands of the skin',
    ],
    answerLetter: 'b',
    explanation:
      'Ceruminous glands are modified apocrine glands in the external auditory meatus that, together with sebaceous glands, produce cerumen (earwax).',
    perChoice: [
      'WRONG - Eccrine sweat glands are a different, distributed gland type.',
      'CORRECT - Ceruminous glands are modified apocrine glands of the ear canal.',
      'WRONG - Sebaceous glands of the eyelid are Meibomian glands.',
      'WRONG - Ceruminous glands are exocrine, not endocrine.',
    ],
    refPage: 178,
    refSection: 'Skin Appendages: Ceruminous and Modified Apocrine Glands',
  },
  {
    n: 9,
    stem: 'Purkinje fibers of the heart are:',
    choices: [
      'Modified skeletal muscle fibers',
      'Modified cardiac muscle fibers specialised for rapid impulse conduction',
      'Autonomic nerve fibers',
      'Smooth muscle bundles',
    ],
    answerLetter: 'b',
    explanation:
      'Purkinje fibers are large, pale, glycogen-rich modified cardiac myocytes forming the terminal conducting network beneath the endocardium.',
    perChoice: [
      'WRONG - The heart is not composed of skeletal muscle.',
      'CORRECT - They are modified cardiomyocytes for fast conduction.',
      'WRONG - Autonomic nerves modulate rate but are not Purkinje fibers.',
      'WRONG - Smooth muscle is not the conducting system.',
    ],
    refPage: 66,
    refSection: 'The Cardiac Conduction System',
  },
  {
    n: 10,
    stem: 'Which cells are responsible for bone resorption?',
    choices: [
      'Osteoblasts',
      'Osteocytes',
      'Osteoclasts',
      'Osteoprogenitor cells',
    ],
    answerLetter: 'c',
    explanation:
      'Osteoclasts are large multinucleated cells of monocyte-macrophage lineage that resorb bone matrix within Howship lacunae.',
    perChoice: [
      'WRONG - Osteoblasts form new bone matrix.',
      'WRONG - Osteocytes maintain existing matrix; they do not resorb.',
      'CORRECT - Osteoclasts resorb bone.',
      'WRONG - Osteoprogenitor cells differentiate into osteoblasts.',
    ],
    refPage: 58,
    refSection: 'Bone Cells: Osteoblasts, Osteocytes and Osteoclasts',
  },
  {
    n: 11,
    stem: 'The predominant cell of the germinal center in a lymph node is:',
    choices: [
      'Plasma cells',
      'Centroblasts and centrocytes (activated B cells)',
      'T helper cells',
      'Macrophages',
    ],
    answerLetter: 'b',
    explanation:
      'Germinal centers are sites of B-cell proliferation, somatic hypermutation and class switching; they are dominated by centroblasts (dark zone) and centrocytes (light zone).',
    perChoice: [
      'WRONG - Plasma cells emerge from germinal centers but reside in medullary cords.',
      'CORRECT - Centroblasts and centrocytes populate the germinal center.',
      'WRONG - T helper cells assist but are not the predominant population.',
      'WRONG - Macrophages phagocytose apoptotic B cells but are outnumbered.',
    ],
    refPage: 199,
    refSection: 'Lymph Node: Cortex and Germinal Centers',
  },
];

function renderPage(doc: PDFKit.PDFDocument, q: Question) {
  doc
    .font('Courier-Bold')
    .fontSize(13)
    .text(`Q${q.n}. ${q.stem}`, { paragraphGap: 8 });

  doc.font('Courier').fontSize(11);
  const letters = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < q.choices.length; i++) {
    doc.text(`${letters[i]}. ${q.choices[i]}`, { paragraphGap: 2 });
  }
  doc.moveDown(0.5);

  const correctText = q.choices[letters.indexOf(q.answerLetter)];
  doc
    .font('Courier-Bold')
    .text(`Answer: ${q.answerLetter}. ${correctText}`, { paragraphGap: 6 });

  doc
    .font('Courier')
    .text(`Explanation: ${q.explanation}`, { paragraphGap: 6 });

  for (let i = 0; i < q.perChoice.length; i++) {
    doc.text(`- ${letters[i]}. ${q.perChoice[i]}`, { paragraphGap: 2 });
  }
  doc.moveDown(0.5);

  doc.text(
    `[Reference: Dr. Ahmed Zahra's Notes, Page ${q.refPage}, Section: ${q.refSection}]`,
    { paragraphGap: 4 }
  );
}

async function main() {
  const outDir = path.join(process.cwd(), 'public/test-data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'demo-questions.pdf');

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  for (let i = 0; i < QUESTIONS.length; i++) {
    if (i > 0) doc.addPage();
    renderPage(doc, QUESTIONS[i]);
  }

  doc.end();
  await new Promise<void>((res) => stream.on('finish', () => res()));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
