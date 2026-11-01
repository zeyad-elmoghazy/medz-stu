# Backlink strategy

A backlink is another site linking to MediZee. A few relevant, earned links beat many bought ones, and
Google penalises manufactured links. Everything below is organic outreach that needs a person — it
cannot be automated, and **none of it has been done yet**.

## Ground rules

- **Earn, never buy.** No paid links, link exchanges at scale, private blog networks, comment spam, or
  "SEO packages". Mass directory submission is the same thing in disguise.
- **Relevance over volume.** One link from a medical-education page is worth more than fifty from
  unrelated sites.
- **Link to `https://www.medizee.app/`** in almost every case. It is the only page with real content;
  `/signup` and `/login` are not link targets.
- **Natural anchor text:** mostly the brand ("MediZee") or the bare URL, sometimes "medical MCQ
  question bank". Never the same keyword phrase over and over.
- Many community links (Telegram, Facebook, WhatsApp, Reddit) are `nofollow` or not crawlable. They
  still matter — they bring students and brand searches — but they are not link equity.

## Before reaching out

1. Search Console verified and the sitemap submitted (`SEO_SEARCH_CONSOLE.md`).
2. `/privacy` and `/terms` finalised. Sending people to a site whose policies say "[DRAFT]" costs trust.
3. A one-paragraph description and a logo ready to paste (`/medizee-logo.webp`, 1072×1072).

## Channels, highest value first

| # | Channel | What to ask for | Notes |
|---|---|---|---|
| 1 | **Faculty, class reps, student unions, medical societies** | A mention or link on a course resources page, society site, or newsletter | The strongest links: relevant, trusted, and usually `follow`. Start with the people who already use it. |
| 2 | **Student communities** (the Telegram/Facebook groups where PDFs circulate, subreddits, Discord) | Share the product where it genuinely answers a question | Follow each group's rules; be a member first. Traffic, not link equity. |
| 3 | **Product and tool directories** (Product Hunt, AlternativeTo, Indie Hackers, BetaList) | One honest listing each | Use the same name, tagline, and logo everywhere. Pick a handful, not hundreds. |
| 4 | **"Best MCQ banks / study tools" roundups** | A short pitch to the author asking to be considered | Find them by searching for the roundups already ranking for your terms. Offer something useful (a free account, facts) — never money. |
| 5 | **Campus and student media** | A short "built by students, for students" story | The authentic angle is the product's actual origin. |
| 6 | **Profiles you control** (LinkedIn, Instagram, X, YouTube) | A link in the bio | Brand signals and discoverability. Once they exist, list them as `sameAs` in the home-page `Organization` schema. |
| 7 | **Original, reviewable content** (a free high-yield guide, a study-streak guide) | Others link to it naturally | Only with accurate, properly reviewed medical content, on a public page. That is a separate project from this SEO pass. |

## Cadence and tracking

Aim for 2–3 genuine outreaches a week and keep a simple sheet:

`Date · Target · Channel · Contact · What was asked · Status · Link URL · Follow / nofollow`

## Measuring

- **Search Console → Links:** referring domains and the top linked page.
- **Search Console → Performance:** impressions and clicks for the query `medizee` — branded searches
  are the clearest early signal.
- Check `site:www.medizee.app` periodically for pages that should be indexed.
- Judge it over months, not days.
