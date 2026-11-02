/**
 * Student username rules, shared by the signup form, the profile editor, the
 * availability endpoint and the profile schema.
 *
 * The database is the authority: migration 039 enforces the same format
 * (profiles_username_format, 030), the reserved list (is_reserved_username)
 * and the change cooldown (enforce_username_rules). This module only exists to
 * give the UI the same answer *before* a round trip, so keep the three in sync.
 */

/** Mirrors the profiles_username_format CHECK (migration 030). */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const USERNAME_FORMAT_MESSAGE = 'Use 3–20 lowercase letters, numbers or underscores';
export const USERNAME_RESERVED_MESSAGE = 'That username is reserved. Please choose another';
export const USERNAME_TAKEN_MESSAGE = 'That username is already taken';

/** Days a student must wait between username changes (migration 039). */
export const USERNAME_COOLDOWN_DAYS = 30;

/**
 * Names that could pass for staff or for the product itself. Mirrors
 * public.is_reserved_username() in migration 039 — change both together.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'staff',
  'team',
  'moderator',
  'mod',
  'official',
  'owner',
  'medizee',
  'medz',
  'null',
  'undefined',
  'anonymous',
  'you',
  'security',
  'leaderboard',
  'noreply',
];

const RESERVED_SET = new Set(RESERVED_USERNAMES);

/** Lowercases and trims, the same normalisation the profile schema applies. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * True when the name is reserved. Trailing digits and underscores are
 * ignored, so `admin1` and `support_` are caught as well as `admin`.
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_SET.has(username.toLowerCase().replace(/[_0-9]+$/, ''));
}

/**
 * The first problem with an (already normalised) username, as a message safe
 * to show the student, or null when it is acceptable. Says nothing about
 * whether it is taken — only the database can answer that.
 */
export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) return USERNAME_FORMAT_MESSAGE;
  if (isReservedUsername(username)) return USERNAME_RESERVED_MESSAGE;
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the student may next change their username, or null if they can now.
 * `changedAt` is profiles.username_changed_at: null means they have not
 * changed it since first choosing it, and that first change is free.
 */
export function nextUsernameChangeAt(
  changedAt: string | null,
  now: Date = new Date()
): Date | null {
  if (!changedAt) return null;
  const changed = new Date(changedAt).getTime();
  if (Number.isNaN(changed)) return null;
  const next = changed + USERNAME_COOLDOWN_DAYS * DAY_MS;
  return next > now.getTime() ? new Date(next) : null;
}

/** "5 Nov 2026": the date shown in cooldown messages. */
export function formatChangeDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
