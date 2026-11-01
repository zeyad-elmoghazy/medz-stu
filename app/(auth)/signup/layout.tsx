import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = pageMetadata('/signup');

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
