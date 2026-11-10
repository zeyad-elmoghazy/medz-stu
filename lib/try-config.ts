/**
 * The public /try page: a few real questions anyone can answer without an
 * account, ending in a "create your free account" prompt.
 *
 * TODO(owner): set `chapterId` to the id of the chapter to feature (any
 * chapter with published questions: copy its id from the catalogue URL or
 * the admin Content tab). Until then /try shows a short "coming soon" and the
 * page stays out of the sitemap and is marked noindex (see lib/seo.ts), so
 * shipping this file unchanged changes nothing visible.
 *
 * ponytail: the FIRST `questionCount` published questions of the chapter, by
 * id. Add a hand-picked `questionIds` list if the owner wants to choose.
 */
export type TryConfig = {
  chapterId: string | null;
  questionCount: number;
};

export const TRY_CONFIG: TryConfig = {
  chapterId: null,
  questionCount: 5,
};
