'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeUsername, validateUsername } from '@/lib/username';

/**
 * What the form should show for the username being typed.
 *
 * `unknown` means the availability check itself failed (offline, rate
 * limited, server error). It must NOT block the student: the database
 * is the authority and rejects a taken name at submit time.
 */
export type UsernameCheck =
  | { status: 'idle' }
  | { status: 'invalid'; message: string }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string }
  | { status: 'unknown' };

type Settled = { name: string; result: UsernameCheck };

/** One-shot check, for re-verifying a name after a rejected submit. */
export async function fetchUsernameAvailability(
  raw: string,
  signal?: AbortSignal
): Promise<UsernameCheck> {
  const name = normalizeUsername(raw);
  const local = validateUsername(name);
  if (local) return { status: 'invalid', message: local };
  try {
    const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(name)}`, {
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return { status: 'unknown' };
    const body = (await res.json()) as { available?: boolean; message?: string };
    if (body.available === true) return { status: 'available' };
    if (body.available === false) {
      return { status: 'unavailable', message: body.message ?? 'That username is not available' };
    }
    return { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}

/**
 * Debounced live availability for a username input. Format and reserved
 * names are answered instantly on the client; only well-formed names hit
 * the server, once the student pauses typing.
 */
export function useUsernameAvailability(raw: string, debounceMs = 400): UsernameCheck {
  const name = useMemo(() => normalizeUsername(raw), [raw]);
  const localProblem = useMemo(() => (name ? validateUsername(name) : null), [name]);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!name || localProblem) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await fetchUsernameAvailability(name, controller.signal);
      if (!controller.signal.aborted) setSettled({ name, result });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, localProblem, debounceMs]);

  if (!name) return { status: 'idle' };
  if (localProblem) return { status: 'invalid', message: localProblem };
  if (settled?.name === name) return settled.result;
  return { status: 'checking' };
}
