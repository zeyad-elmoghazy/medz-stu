// Static slug -> cover photo map for the 11 subjects with commissioned
// art (public/subjects/*.webp). Subjects added to the DB later without
// a matching photo fall back to the initials-badge treatment that
// catalogue cards already render, so this never needs a migration.
const SUBJECT_IMAGES: Record<string, string> = {
  anatomy: '/subjects/anatomy.webp',
  biochemistry: '/subjects/biochemistry.webp',
  embryology: '/subjects/embryology.webp',
  genetics: '/subjects/genetics.webp',
  histology: '/subjects/histology.webp',
  immunology: '/subjects/immunology.webp',
  microbiology: '/subjects/microbiology.webp',
  parasitology: '/subjects/parasitology.webp',
  pathology: '/subjects/pathology.webp',
  pharmacology: '/subjects/pharmacology.webp',
  physiology: '/subjects/physiology.webp',
};

export function getSubjectImage(slug: string): string | null {
  return SUBJECT_IMAGES[slug] ?? null;
}
