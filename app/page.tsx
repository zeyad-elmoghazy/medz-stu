import LandingPage from '@/components/landing/LandingPage';
import { JsonLd } from '@/components/seo/JsonLd';
import { loadLandingData } from '@/lib/landing-data';
import { SITE_NAME, SITE_URL, pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/');

// ISR: the catalogue strip is rebuilt from the database at most once an
// hour. Without this the page is only as fresh as the last deploy.
export const revalidate = 3600;

// Only facts that are visible on the page / true of the site: who
// publishes it and what the site is called. No FAQ/Review/Rating
// markup (nothing on the page backs it) and no SearchAction (the site
// has no search).
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/medizee-logo.webp`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default async function HomePage() {
  const { stats, modules } = await loadLandingData();

  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <LandingPage stats={stats} modules={modules} />
    </>
  );
}
