import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

// Indexable only once lib/try-config.ts names a chapter — see lib/seo.ts.
export const metadata: Metadata = pageMetadata('/try');

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
