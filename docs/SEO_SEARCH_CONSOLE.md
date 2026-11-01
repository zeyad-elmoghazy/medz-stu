# Search Console — owner steps

The code side of SEO is in the repo (sitemap, robots, canonicals, metadata, schema). Telling Google
the site exists is an account action only the domain owner can take. **Until this is done, Google may
not know `www.medizee.app` exists at all** — the domain only became the primary host on 2026-10-18.

## 1. Verify the domain (DNS — recommended)

A **Domain property** covers `www`, the apex, `http` and `https` in one go.

1. Open <https://search.google.com/search-console> → **Add property** → **Domain** → `medizee.app`.
2. Google shows a `TXT` record (`google-site-verification=…`).
3. Add it as a `TXT` record on `medizee.app` wherever its DNS lives (Vercel → Domains → `medizee.app` →
   DNS Records, if the nameservers are Vercel's). Host/name: `@`.
4. Back in Search Console press **Verify** (DNS can take a few minutes to hours).

### Alternative: HTML tag (URL-prefix property)

If DNS access is awkward, add the token Google gives you to the root metadata in `app/layout.tsx`:

```ts
export const metadata: Metadata = {
  // …existing fields
  verification: { google: '<token from Search Console>' },
};
```

Then deploy and press **Verify**. Use the exact prefix `https://www.medizee.app/`.

## 2. Submit the sitemap

Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**. It lists the three indexable pages:
`/`, `/signup`, `/login`.

## 3. Ask Google to crawl the key pages

**URL Inspection** → paste each URL → **Test live URL** → **Request indexing**:

- `https://www.medizee.app/`
- `https://www.medizee.app/signup`
- `https://www.medizee.app/login`

## 4. What "normal" looks like afterwards

- **Pages report:** `/privacy`, `/terms`, `/forgot-password`, `/reset-password` appear as
  *Excluded by 'noindex' tag*. That is intended (see `lib/seo.ts`).
- `/student/*`, `/admin/*`, `/api/*` are blocked by `robots.txt` — they require login, so there is
  nothing for Google to index there.
- Indexing a brand-new small site takes days to a few weeks. Searching `MediZee` should surface the
  site first; competitive generic terms ("medical MCQ question bank") take real content and links
  (see `SEO_BACKLINK_STRATEGY.md`).
- Check progress with `site:www.medizee.app` in Google.

## 5. When the legal pages are final

`/privacy` and `/terms` are `noindex` while their copy says "Draft — pending legal review". Once the
text is final, set `indexable: true` for both in `lib/seo.ts`. The sitemap and the `robots` metadata
follow automatically (a unit test in `__tests__/unit/seo.test.ts` enforces that).

## 6. Quick health checks after each deploy

```bash
curl -sI https://www.medizee.app/sitemap.xml | head -1       # HTTP/2 200
curl -s  https://www.medizee.app/robots.txt                  # has the Sitemap: line
curl -s  https://www.medizee.app/ | grep -c 'rel="canonical"' # 1
```

Validate structured data at <https://search.google.com/test/rich-results> (the home page carries
`Organization` and `WebSite` markup).

## 7. Auth emails: broken logo

The Supabase email templates link to `/medizee-logo-source.png`, which no longer exists on production
(404), so the logo is broken in confirmation and recovery emails. A small email-safe PNG now ships at
`https://www.medizee.app/medizee-logo-email.png`. Templates are pasted into the Supabase dashboard by
hand, so replace the image URL there (Authentication → Email Templates).
