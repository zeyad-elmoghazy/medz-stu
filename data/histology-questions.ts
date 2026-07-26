export type Choice = {
  id: string;
  text: string;
};

export type HistologyQuestion = {
  id: number;
  question: string;
  choices: Choice[];
  correctAnswer: string;
  explanation: string;
  choiceRationales?: Record<string, string>;
  reference: string;
  topic: string;
  // Rendered page image of the source notes for this question,
  // populated when the professor uploaded a notes PDF alongside
  // the questions PDF. Null for legacy rows and demo data.
  referenceImageUrl?: string | null;
};

export const histologyQuestions: HistologyQuestion[] = [
  {
    id: 1,
    question: "Cowper's glands are characterized by:",
    choices: [
      { id: 'a', text: 'Provides 65% – 75% of seminal fluid' },
      { id: 'b', text: 'Their duct joins the membranous part of the urethra' },
      { id: 'c', text: 'They neutralize any traces of acidic urine' },
      { id: 'd', text: 'Their secretion is rich in fibrinolysin' },
    ],
    correctAnswer: 'c',
    explanation:
      "Cowper's (Bulbo-urethral) glands produce a clear mucus secretion that lubricates the penile urethra and neutralizes any traces of acidic urine before the passage of semen.",
    choiceRationales: {
      a: "WRONG — It is the seminal vesicles that supply 70–80% of seminal fluid, not Cowper's glands.",
      b: 'WRONG — Their duct joins the initial portion of the penile urethra, not the membranous part.',
      c: 'CORRECT — Their function is to lubricate the penile urethra and neutralize residual acidic urine.',
      d: "WRONG — It is the prostate whose secretion is rich in fibrinolysin, not Cowper's glands.",
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 37 — The Bulbo-Urethral (Cowper's) Glands.",
    referenceImageUrl: '/references/q-01.jpg',
    topic: 'Male reproductive system',
  },
  {
    id: 2,
    question: 'Which of the following characterizes the mature Graafian follicle?',
    choices: [
      { id: 'a', text: 'Theca interna cells can differentiate into smooth muscle cells' },
      { id: 'b', text: 'Gap junctions are present in the perivitelline space' },
      { id: 'c', text: 'Corona radiata is a single layer of flat cells' },
      { id: 'd', text: 'Theca externa secretes androgen' },
    ],
    correctAnswer: 'b',
    explanation:
      'In the mature Graafian follicle, corona radiata cells send cytoplasmic processes that penetrate the zona pellucida and contact microvilli projecting from the oocyte via gap junctions in the perivitelline space — allowing passage of ions, metabolites, and other substances to the oocyte.',
    choiceRationales: {
      a: 'WRONG — Theca interna cells secrete androgen (precursor of estrogen) and show steroid-secreting cell features; they do not become smooth muscle.',
      b: 'CORRECT — Gap junctions sit in the perivitelline space between corona radiata processes and oocyte microvilli.',
      c: 'WRONG — Corona radiata is a single layer of granulosa cells with a columnar shape, not flat cells.',
      d: 'WRONG — Theca interna secretes androgen. Theca externa is a compact layer of fibroblast-like cells with no secretory function.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 47 — Mature Graafian (Tertiary) Follicles · Corona Radiata, Theca Interna & Externa.",
    referenceImageUrl: '/references/q-02.jpg',
    topic: 'Female reproductive system',
  },
  {
    id: 3,
    question: 'The following is a characteristic feature of Pars nervosa:',
    choices: [
      { id: 'a', text: 'Formed of groups of secretory cells separated by fenestrated capillaries' },
      { id: 'b', text: 'Has accumulated neurosecretion called Herring bodies' },
      { id: 'c', text: 'Pinealocytes are branched supporting cells' },
      { id: 'd', text: 'Herring bodies are nerve cells that accumulate neurosecretion' },
    ],
    correctAnswer: 'b',
    explanation:
      'Pars nervosa contains pituicytes, nerve fibers, Herring bodies (acidophilic bodies of accumulated neurosecretion in axon terminals of nerve fibers), and fenestrated capillaries.',
    choiceRationales: {
      a: 'WRONG — Cords of secretory cells separated by fenestrated capillaries describes Pars distalis (adenohypophysis), not Pars nervosa.',
      b: 'CORRECT — Herring bodies are accumulated neurosecretion (oxytocin & vasopressin) in axon terminals of nerve fibers.',
      c: 'WRONG — Pituicytes are the branched neuroglial supporting cells of Pars nervosa. Pinealocytes belong to the pineal gland.',
      d: 'WRONG — Herring bodies are not nerve cells; they are accumulated neurosecretion in axon terminals. Pars nervosa contains nerve fibers (axons of hypothalamic neurons), no nerve cells.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 7 — Neurohypophysis · Pars Nervosa Structure.",
    referenceImageUrl: '/references/q-03.jpg',
    topic: 'Endocrine — Pituitary',
  },
  {
    id: 4,
    question: 'Regarding pineal body:',
    choices: [
      { id: 'a', text: 'Pinealocytes are innervated by myelinated nerve fibers' },
      { id: 'b', text: 'Psammoma bodies are considered a landmark in brain X-ray' },
      { id: 'c', text: 'Derived from mesoderm' },
      { id: 'd', text: 'Pinealocytes are rich in sER & lipid droplets' },
    ],
    correctAnswer: 'b',
    explanation:
      'Brain sand (psammoma bodies / corpora arenacea) are calcified concretions — calcified secretory products in concentric layers — that increase with age and serve as a landmark in X-ray to localize any brain mass that may displace their position.',
    choiceRationales: {
      a: 'WRONG — Pinealocytes are innervated by unmyelinated, not myelinated, nerve fibers.',
      b: 'CORRECT — Psammoma bodies are a landmark in brain X-ray to localize any intracranial mass that displaces them.',
      c: 'WRONG — The pineal gland is derived from neuroectoderm, not mesoderm.',
      d: 'WRONG — Pinealocytes have basophilic cytoplasm rich in mitochondria, Golgi, rER, and secretory granules. sER & lipid droplets are features of steroid-secreting cells, which pinealocytes are not.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 17 — Pineal Body (Epiphysis Cerebri) · Brain Sand & Pinealocytes.",
    referenceImageUrl: '/references/q-04.jpg',
    topic: 'Endocrine — Pineal',
  },
  {
    id: 5,
    question: 'Which of the following is a histological feature of cytotrophoblasts?',
    choices: [
      { id: 'a', text: 'Deeply stained cytoplasm' },
      { id: 'b', text: 'Have numerous microvilli' },
      { id: 'c', text: 'Nuclei form syncytial knots' },
      { id: 'd', text: 'Clear cell boundaries' },
    ],
    correctAnswer: 'd',
    explanation:
      'The inner cytotrophoblast is a single layer of cuboidal cells with clear cell boundaries, pale-staining cytoplasm, and no microvilli, which disappears by the end of the 4th month of pregnancy.',
    choiceRationales: {
      a: 'WRONG — Deeply stained cytoplasm is a feature of the outer syncytiotrophoblast. Cytotrophoblasts have pale-staining cytoplasm.',
      b: 'WRONG — Numerous microvilli (to invade decidua basalis) are a feature of the syncytiotrophoblast; cytotrophoblasts have no microvilli.',
      c: 'WRONG — Nuclei forming syncytial knots are a feature of the syncytiotrophoblast; knots increase with gestational age.',
      d: 'CORRECT — Cytotrophoblasts have clear cell boundaries, distinguishing them from the syncytiotrophoblast which has none.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 61 — Inner Cytotrophoblast vs. Outer Syncytiotrophoblast table.",
    referenceImageUrl: '/references/q-05.jpg',
    topic: 'Female reproductive — Placenta',
  },
  {
    id: 6,
    question: 'Which of the following accurately describes the Sertoli cells?',
    choices: [
      { id: 'a', text: 'Have well-defined lateral borders' },
      { id: 'b', text: 'Polygonal cells with few lipid droplets' },
      { id: 'c', text: 'Have deeply acidophilic cytoplasm' },
      { id: 'd', text: 'Phagocytose residual bodies' },
    ],
    correctAnswer: 'd',
    explanation:
      'Sertoli cells contain lysosomes responsible for phagocytosis of residual bodies (shed during spermiogenesis) and degenerated spermatogenic cells.',
    choiceRationales: {
      a: 'WRONG — Sertoli cells have ill-defined cell boundaries. Their irregular contours come from ramifying cytoplasmic extensions that form pockets housing spermatogenic cells.',
      b: 'WRONG — Large polygonal cells with acidophilic cytoplasm and lipid droplets describes Leydig (interstitial) cells. Sertoli cells are tall pyramidal cells.',
      c: 'WRONG — Sertoli cell cytoplasm is pale acidophilic, not deeply acidophilic.',
      d: 'CORRECT — Sertoli cells phagocytose residual bodies (excess cytoplasm shed during the spermiogenesis maturation phase) and degenerated spermatogenic cells via their lysosomes.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 28–29 — B. Sertoli Cells · LM features & Lysosomes function.",
    referenceImageUrl: '/references/q-06.jpg',
    topic: 'Male reproductive — Testis',
  },
  {
    id: 7,
    question: 'Which of the following have features of steroid-forming cells?',
    choices: [
      { id: 'a', text: 'Spongiocytes' },
      { id: 'b', text: 'Somatotrophs' },
      { id: 'c', text: 'Chromaffin cells' },
      { id: 'd', text: 'Carminophils' },
    ],
    correctAnswer: 'a',
    explanation:
      'Spongiocytes occupy the Zona Fasciculata of the adrenal cortex. At the EM level they are rich in mitochondria, Golgi apparatus, sER, and many fat droplets — all classic features of steroid-secreting cells.',
    choiceRationales: {
      a: 'CORRECT — Spongiocytes are steroid-secreting cells with abundant sER, mitochondria, and lipid droplets.',
      b: 'WRONG — Somatotrophs secrete growth hormone, a protein hormone. They are protein-synthesizing cells with prominent Golgi, rER, mitochondria, and secretory granules.',
      c: 'WRONG — Chromaffin cells secrete catecholamines (adrenalin & noradrenalin). They have basophilic cytoplasm with fine membrane-bound secretory granules — not steroid features.',
      d: 'WRONG — Carminophils (mammotrophs) secrete prolactin, a protein/lactogenic hormone. They show protein-synthesizing features, not steroid-forming ones.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 10 — Cortex · Zona Fasciculata (Spongiocytes); Page 4 — Acidophils (Mammotrophs).",
    referenceImageUrl: '/references/q-07.jpg',
    topic: 'Endocrine — Adrenal cortex',
  },
  {
    id: 8,
    question: 'In the resting state of breast, which of the following is true?',
    choices: [
      { id: 'a', text: 'Thick dense connective tissue septa' },
      { id: 'b', text: 'Fewer amounts of fat cells' },
      { id: 'c', text: 'Each lobule consists of ducts and alveoli' },
      { id: 'd', text: 'Milk appears as vacuolated acidophilic secretion' },
    ],
    correctAnswer: 'a',
    explanation:
      'In the resting state of the breast, the gland is composed of 12–20 lobes separated by thick, dense connective-tissue septa rich in fat cells.',
    choiceRationales: {
      a: 'CORRECT — Thick, dense C.T. septa characterize the resting state.',
      b: 'WRONG — Resting-state septa are rich in fat cells. Fewer fat cells appear in the pregnant & lactating state, when septa thin out.',
      c: 'WRONG — In the resting state each lobe contains small lactiferous ducts in loose C.T. Alveoli (secretory units) are absent and only appear during pregnancy and lactation.',
      d: 'WRONG — Vacuolated acidophilic milk in the lumen is a feature of the pregnant/lactating breast, seen in alveolar lumens which are absent in the resting state.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 63 — Female Mammary Gland · Resting state of Breast table.",
    referenceImageUrl: '/references/q-08.jpg',
    topic: 'Female reproductive — Mammary gland',
  },
  {
    id: 9,
    question: 'Regarding spongiocytes, the following statement is correct:',
    choices: [
      { id: 'a', text: 'Polyhedral cells with basal nuclei arranged in anastomosing cords' },
      { id: 'b', text: 'Columnar cells with central nuclei arranged in arched groups' },
      { id: 'c', text: 'Polyhedral cells with central nuclei arranged in fascicles' },
      { id: 'd', text: 'Columnar cells with basal nuclei arranged in straight cords' },
    ],
    correctAnswer: 'c',
    explanation:
      'Spongiocytes live in the Zona Fasciculata: polyhedral cells with central, rounded, pale vesicular nuclei, arranged in narrow straight cords (fascicles) one or two cells wide, separated by straight fenestrated capillaries.',
    choiceRationales: {
      a: 'WRONG — Polyhedral cells in anastomosing cords describes the Zona Reticularis; its cells also have central (not basal) nuclei.',
      b: 'WRONG — Columnar cells in arched groups describes the Zona Glomerulosa, but those cells have basal rounded nuclei, not central.',
      c: 'CORRECT — Spongiocytes (Zona Fasciculata) are polyhedral cells with central nuclei arranged in fascicles (narrow straight cords).',
      d: 'WRONG — This mixes features: columnar cells with basal nuclei belong to Zona Glomerulosa, but they are arranged in arched (glomerular) groups, not straight cords.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 10 — Cortex · Zona Fasciculata, Glomerulosa & Reticularis.",
    referenceImageUrl: '/references/q-09.jpg',
    topic: 'Endocrine — Adrenal cortex',
  },
  {
    id: 10,
    question: 'Corpora cavernosa of the penis is characterized by:',
    choices: [
      { id: 'a', text: 'Being ventrally located' },
      { id: 'b', text: 'Surrounded by more elastic fibers than corpus spongiosum' },
      { id: 'c', text: 'Covered by thick tunica albuginea' },
      { id: 'd', text: 'Having penile urethra passing through' },
    ],
    correctAnswer: 'c',
    explanation:
      'Corpora are covered by a layer of dense white fibrous connective tissue — the tunica albuginea. Specifically, the corpora cavernosa are covered by a thick tunica albuginea, while the corpus spongiosum has a thin one.',
    choiceRationales: {
      a: 'WRONG — Corpora cavernosa are dorsally located (two of them). The corpus spongiosum is ventral and carries the penile urethra.',
      b: 'WRONG — It is the corpus spongiosum that is surrounded by more elastic fibers than the corpora cavernosa.',
      c: 'CORRECT — Corpora cavernosa are covered by a thick tunica albuginea.',
      d: 'WRONG — The penile urethra runs through the corpus spongiosum, not the corpora cavernosa.',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 38 — The Penis; Page 39 — Erectile Tissues.",
    referenceImageUrl: '/references/q-10.jpg',
    topic: 'Male reproductive — Penis',
  },
  {
    id: 11,
    question: 'The most susceptible acini for prostatic cancer are present in:',
    choices: [
      { id: 'a', text: 'Peripheral zone' },
      { id: 'b', text: 'Transitional zone' },
      { id: 'c', text: 'Central zone' },
      { id: 'd', text: 'Acini occupying the anterior part of prostate' },
    ],
    correctAnswer: 'a',
    explanation:
      'The peripheral zone corresponds to the peripheral layer of acini occupying the lateral and posterior parts of the prostate. It comprises 70% of the glandular tissue and is the most susceptible zone for inflammation (chronic prostatitis) and prostatic cancer.',
    choiceRationales: {
      a: 'CORRECT — Peripheral zone is the most susceptible site for prostatic cancer.',
      b: 'WRONG — The transitional zone corresponds to the mucosal & submucosal layers around the prostatic urethra and is the most susceptible site for benign prostatic hyperplasia, not cancer.',
      c: 'WRONG — The central zone surrounds the ejaculatory ducts and is usually resistant to both inflammation and carcinoma.',
      d: '"Acini occupying the anterior part of prostate" does not correspond to any of the three recognized clinical zones (central, transitional, peripheral).',
    },
    reference:
      "Dr. Ahmed Zahra's Notes, Page 36 — The adult prostatic parenchyma · 3 zones.",
    referenceImageUrl: '/references/q-11.jpg',
    topic: 'Male reproductive — Prostate',
  },
];

export const histologySubject = {
  id: 'histology',
  name: 'Histology — Block 1',
  professor: 'Dr. Ahmed Zahra',
  totalQuestions: histologyQuestions.length,
  estimatedMinutes: 22,
};
