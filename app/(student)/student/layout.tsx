import type { ReactNode } from 'react';
import { DisplayNameProvider } from '@/lib/use-display-name';
import { StudentThemeProvider } from '@/lib/use-student-theme';

// Shared by every /student/* route. Next.js keeps a layout's component
// instance mounted across navigation between its child routes, so
// DisplayNameProvider's fetch (see lib/use-display-name.ts) runs once
// per session here instead of once per page. StudentThemeProvider
// (lib/use-student-theme.tsx) gives the whole /student tree the same
// shared theme state and [data-mz-root] scope the landing page has —
// see LIGHT_MODE_AUDIT.md for why that was missing before.
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <StudentThemeProvider>
      <DisplayNameProvider>{children}</DisplayNameProvider>
    </StudentThemeProvider>
  );
}
