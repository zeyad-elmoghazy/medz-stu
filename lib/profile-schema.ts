import { z } from 'zod';
import { ACADEMIC_YEAR_MAX, ACADEMIC_YEAR_MIN } from '@/lib/academic-year';
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_PATTERN,
  USERNAME_RESERVED_MESSAGE,
  isReservedUsername,
} from '@/lib/username';

/**
 * Request schemas for the student self-service profile endpoints.
 *
 * `profilePatchSchema` is deliberately a closed allow-list (`.strict()`):
 * it is the ONLY way the UI writes to `profiles`, and the table's RLS
 * update policy is column-agnostic, so anything not listed here (xp,
 * role, session, …) is rejected rather than silently passed through.
 */

// The username rules live in lib/username.ts; re-exported so existing
// imports of USERNAME_PATTERN from here keep working.
export { USERNAME_PATTERN };

export const profilePatchSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(USERNAME_PATTERN, USERNAME_FORMAT_MESSAGE)
      .refine((value) => !isReservedUsername(value), USERNAME_RESERVED_MESSAGE),
    academic_year: z.number().int().min(ACADEMIC_YEAR_MIN).max(ACADEMIC_YEAR_MAX),
    notify_email: z.boolean(),
    notify_reminders: z.boolean(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Nothing to update',
  });

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    // 8 matches app/(auth)/reset-password; 72 is bcrypt's input limit.
    next: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long'),
  })
  .strict()
  .refine((v) => v.current !== v.next, {
    message: 'New password must be different from the current one',
    path: ['next'],
  });

export type PasswordChange = z.infer<typeof passwordChangeSchema>;

export const deleteAccountSchema = z
  .object({ confirm: z.string().trim().min(1, 'Type your email to confirm') })
  .strict();
