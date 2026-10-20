import { z } from 'zod';

/**
 * Shared vocabulary for "student reports a question".
 *
 * One source of truth for the student modal, the POST route's body
 * validation and the admin Reports tab. The reason list and the
 * detail cap are mirrored by CHECK constraints in
 * supabase/migrations/033_question_flag_admin.sql — keep them in
 * step if either changes.
 */
export const FLAG_REASONS = [
  'wrong_answer',
  'ambiguous',
  'typo',
  'wrong_reference',
  'other',
] as const;

export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  wrong_answer: 'The marked answer looks wrong',
  ambiguous: 'The question is unclear or ambiguous',
  typo: 'Typo or formatting problem',
  wrong_reference: 'The reference or page is wrong',
  other: 'Something else',
};

export const FLAG_DETAIL_MAX = 1000;

export const FlagBodySchema = z.object({
  reason: z.enum(FLAG_REASONS),
  detail: z.string().trim().max(FLAG_DETAIL_MAX).optional(),
});

export type FlagBody = z.infer<typeof FlagBodySchema>;
