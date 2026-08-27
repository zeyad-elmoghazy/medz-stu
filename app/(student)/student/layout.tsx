import type { ReactNode } from 'react';
import { DisplayNameProvider } from '@/lib/use-display-name';

// Shared by every /student/* route. Next.js keeps a layout's component
// instance mounted across navigation between its child routes, so
// DisplayNameProvider's fetch (see lib/use-display-name.ts) runs once
// per session here instead of once per page.
export default function StudentLayout({ children }: { children: ReactNode }) {
  return <DisplayNameProvider>{children}</DisplayNameProvider>;
}
