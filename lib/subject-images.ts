// Static slug -> cover photo map for the 11 subjects with commissioned
// art (public/subjects/*.webp). Subjects added to the DB later without
// a matching photo fall back to the initials-badge treatment that
// catalogue cards already render, so this never needs a migration.
// "-v2" files are the refreshed art; the suffix busts the long-lived
// next/image cache (see images.minimumCacheTTL in next.config.js).
const SUBJECT_IMAGES: Record<string, string> = {
  anatomy: '/subjects/anatomy-v2.webp',
  biochemistry: '/subjects/biochemistry-v2.webp',
  embryology: '/subjects/embryology.webp',
  genetics: '/subjects/genetics.webp',
  histology: '/subjects/histology-v2.webp',
  immunology: '/subjects/immunology.webp',
  microbiology: '/subjects/microbiology-v2.webp',
  parasitology: '/subjects/parasitology-v2.webp',
  pathology: '/subjects/pathology-v2.webp',
  pharmacology: '/subjects/pharmacology-v2.webp',
  physiology: '/subjects/physiology-v2.webp',
};

export function getSubjectImage(slug: string): string | null {
  return SUBJECT_IMAGES[slug] ?? null;
}
