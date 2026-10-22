import { isTouchDevice } from '@/lib/is-touch-device';

// Fake window whose matchMedia only matches the exact touch query.
const fakeWindow = (touch: boolean) => ({
  matchMedia: (q: string) => ({
    matches: touch && q === '(hover: none) and (pointer: coarse)',
  }),
});

describe('isTouchDevice', () => {
  it('is true for a no-hover, coarse-pointer device (phone/tablet)', () => {
    expect(isTouchDevice(fakeWindow(true))).toBe(true);
  });

  it('is false for a mouse/trackpad device (laptop)', () => {
    expect(isTouchDevice(fakeWindow(false))).toBe(false);
  });

  it('is false when matchMedia or window is unavailable (SSR)', () => {
    expect(isTouchDevice({})).toBe(false);
    expect(isTouchDevice()).toBe(false); // jest runs in node: no window
  });
});
