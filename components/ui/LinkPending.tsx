'use client';

import { createPortal } from 'react-dom';
import { useLinkStatus } from 'next/link';

/**
 * Drop this inside a <Link>. While that link's navigation is pending — i.e. its
 * prefetch hadn't finished when it was clicked, so there is no loading shell to show
 * yet — it shows a thin progress bar at the top of the viewport, so the click never
 * feels dead. It renders nothing otherwise (no layout shift), and the bar only becomes
 * visible after a short delay (see .mz-nav-progress) so fast navigations don't flash it.
 *
 * Portaled into the theme root, not <body>: the colour tokens are scoped to [data-mz-root].
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div className="mz-nav-progress" aria-hidden="true" />,
    document.querySelector('[data-mz-root]') ?? document.body
  );
}
