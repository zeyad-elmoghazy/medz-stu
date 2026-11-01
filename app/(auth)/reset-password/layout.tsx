import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = pageMetadata('/reset-password');

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
