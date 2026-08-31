'use client';

import { useEffect, useState } from 'react';

/**
 * Returns whether the page has scrolled past `threshold`, for a
 * sticky nav's "distinguish scrolled from top" background/shadow.
 *
 * Shared by StudentNavbar and the dashboard's own Navbar, which each
 * had their own copy of this before: a `useState` whose value fed an
 * inline style object that also toggled `backdropFilter` — a live
 * backdrop blur recomputed on every scroll-position flip, the
 * actually expensive part of the old pattern. This version still
 * uses React state (an earlier version tried a ref + classList.toggle
 * to avoid the state update entirely, but that fights React: any
 * re-render for an unrelated reason — e.g. a parent passing new
 * props — reconciles `className` back to exactly what JSX specifies,
 * silently discarding a class added outside React's own render).
 * Consumers apply the returned boolean to a static CSS class
 * (`.mz-nav-scroll.is-scrolled` in globals.css) with a plain
 * background-color/box-shadow `transition` — no backdrop-filter, no
 * per-scroll inline-style rebuild, the compositor owns the
 * transition once React sets the class.
 */
export function useScrollShadow(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);

  return scrolled;
}
