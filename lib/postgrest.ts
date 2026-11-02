/**
 * PostgREST embeds a to-one relation (e.g. `chapters.subjects`) as an
 * object, but typed-loosely clients can surface a one-element array.
 * Normalise both to the single row (or null).
 */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
