'use client';

import { useCallback, useEffect, useState } from 'react';

// =============================================================
// Client-side chapter progress store — localStorage keyed by
// `subjectId/moduleCode/chapterId`. Kept intentionally tiny:
// the modules/chapters pages need only read + reset; the quiz
// itself marks a chapter complete on session completion.
// =============================================================

const STORAGE_KEY = 'medz_chapter_progress_v1';

type ProgressMap = Record<string, number>;

function keyOf(subjectId: string, moduleCode: string, chapterId: string) {
  return `${subjectId}/${moduleCode}/${chapterId}`;
}

function readAll(): ProgressMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Guard against a stray non-object payload — never crash the UI.
    return parsed && typeof parsed === 'object' ? (parsed as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: ProgressMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full / private mode — in-memory state is still valid.
  }
}

// Fires whenever we mutate progress, so other mounted components
// (e.g., the modules page's aggregate ring) stay in sync without
// prop drilling. Same-tab events; cross-tab is handled by native
// "storage" events.
const CHANGE_EVENT = 'medz:chapter-progress-changed';

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Read progress hook. Falls back to `fallback` when nothing has
 * been persisted for this chapter yet — pass the design's
 * `defaultProgress` here so seeded chapters keep their demo value.
 */
export function useChapterProgress(
  subjectId: string,
  moduleCode: string,
  chapterId: string,
  fallback: number
): number {
  const [value, setValue] = useState<number>(fallback);

  useEffect(() => {
    const all = readAll();
    const stored = all[keyOf(subjectId, moduleCode, chapterId)];
    setValue(typeof stored === 'number' ? stored : fallback);

    const sync = () => {
      const next = readAll()[keyOf(subjectId, moduleCode, chapterId)];
      setValue(typeof next === 'number' ? next : fallback);
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [subjectId, moduleCode, chapterId, fallback]);

  return value;
}

/**
 * Read progress for many chapters at once. Order-preserving map
 * result so the caller can align it back to its chapter list.
 * Used by the modules page to compute per-module completion.
 */
export function useModuleProgress(
  subjectId: string,
  moduleCode: string,
  chapters: Array<{ id: string; defaultProgress: number }>
): Record<string, number> {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    chapters.forEach((c) => { seed[c.id] = c.defaultProgress; });
    return seed;
  });

  useEffect(() => {
    const compute = () => {
      const all = readAll();
      const next: Record<string, number> = {};
      chapters.forEach((c) => {
        const stored = all[keyOf(subjectId, moduleCode, c.id)];
        next[c.id] = typeof stored === 'number' ? stored : c.defaultProgress;
      });
      setValues(next);
    };
    compute();
    window.addEventListener(CHANGE_EVENT, compute);
    window.addEventListener('storage', compute);
    return () => {
      window.removeEventListener(CHANGE_EVENT, compute);
      window.removeEventListener('storage', compute);
    };
    // The chapters array identity is stable per module render — safe
    // to include so a module swap re-reads correctly.
  }, [subjectId, moduleCode, chapters]);

  return values;
}

export function useChapterProgressActions(subjectId: string, moduleCode: string) {
  const markComplete = useCallback((chapterId: string) => {
    const all = readAll();
    all[keyOf(subjectId, moduleCode, chapterId)] = 100;
    writeAll(all);
    emitChange();
  }, [subjectId, moduleCode]);

  const reset = useCallback((chapterId: string) => {
    // Store 0 explicitly rather than deleting the key — the seed
    // `defaultProgress` from the catalog would otherwise re-populate
    // to 100 on next read and undo "Solve Again".
    const all = readAll();
    all[keyOf(subjectId, moduleCode, chapterId)] = 0;
    writeAll(all);
    emitChange();
  }, [subjectId, moduleCode]);

  return { markComplete, reset };
}
