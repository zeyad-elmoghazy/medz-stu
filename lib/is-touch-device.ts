// True when the primary input is a finger (phones, tablets): no hover and a
// coarse pointer. Same query the touch CSS in app/globals.css uses, so
// "touch" means one thing everywhere. A laptop whose primary input is a
// mouse/trackpad is NOT touch, even with a touchscreen.
type MatchMediaWindow = {
  matchMedia?: (query: string) => { matches: boolean };
};

export function isTouchDevice(win?: MatchMediaWindow): boolean {
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  return !!w?.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
}
