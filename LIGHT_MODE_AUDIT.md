# Light Mode Audit — Student Dashboard

**Date:** 2026-09-10
**Scope:** Read-only investigation. No application source changed. This file is the only artifact.
**Question:** Light mode works on the landing page. The student dashboard has a light-mode toggle button that does nothing. Why, and what has to change to make it work?

---

## 0. TL;DR — Root-cause diagnosis

The dashboard toggle does nothing because **there is no theme system wired into the student route group at all.** Specifically:

1. **The two "Toggle theme" buttons in the student area have no `onClick` handler.** They are static markup — a `<Moon>` icon in a `<button>` with styling and an `aria-label`, nothing else. Clicking them cannot do anything because nothing is bound to the click.
   - `app/(student)/student/dashboard/page.tsx:271-288` (dashboard's own inline `Navbar`)
   - `components/student/StudentNavbar.tsx:145-162` (the shared student navbar used by every other `/student/*` page)

2. **The landing page's theme system is 100% local to `app/page.tsx`.** It is not a provider, not a context, not `next-themes`, not a Tailwind `dark:` toggle. It is a `useState` inside the `MediZeeHome` component plus a `<style dangerouslySetInnerHTML>` block scoped to `[data-mz-root]`. Nothing outside that one file can read or drive it. See §1.

3. **No shared theme provider exists anywhere in the App Router tree.** `app/layout.tsx` hardcodes `className="… dark"` on `<html>` and renders no provider. `app/(student)/student/layout.tsx` wraps children in `DisplayNameProvider` only. So even if the buttons had an `onClick`, there is no shared state for them to flip and no light token set for the student UI to respond to. See §2.

4. **Every student page and the components they use are built from hardcoded dark hex/rgba in inline `style={{…}}` objects** — ~400+ hex literals and ~200+ `rgba()` literals across 10 pages plus shared components, zero `var(--token)` consumers, zero Tailwind `dark:` variants. Even once a provider exists, the UI will not change colour until those literals are replaced with theme-aware tokens. This — not the provider — is the real body of work. See §4.

5. **The Tailwind "dark mode" in this repo is vestigial.** `tailwind.config.js` has `darkMode: ['class']`, but every colour token in it is a **fixed dark hex value** (`background: '#0B1F33'`, `card: '#132B45'`, …). There is no light palette to switch to, and nothing ever adds/removes the `dark` class. The `dark` class on `<html>` is decorative. See §5.

There is also a **third, separate, also-non-functional theme control**: the "Dark theme" switch on `app/(student)/student/profile/page.tsx:194-200`. It *does* have an `onClick`, but it only writes a preference to `localStorage['medz.studentPrefs']` and applies nothing. Its hint text literally reads "Light theme is coming soon."

So there are **three disconnected theme controls** in the student area (two dead buttons + one preference-only switch), **two different `localStorage` keys** (`mz-theme` on landing, `medz.studentPrefs` on profile), and **no shared mechanism** binding any of them to anything.

---

## 1. Theme mechanism on the landing page (`app/page.tsx`)

**Confirmed from code, not assumed.**

### Styling approach
Not Tailwind `dark:`. Not `next-themes` (not a dependency — see `package.json`; the only `createContext` in the codebase is `DisplayNameContext` in `lib/use-display-name.tsx`). Not CSS `@media (prefers-color-scheme)`.

It is a **self-contained CSS-custom-property swap driven by a data attribute**, all inside the single client component `MediZeeHome`:

- `app/page.tsx:65-101` — a template-string `PAGE_CSS` injected via `<style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />` at `app/page.tsx:172`.
- `app/page.tsx:66` — dark token set: `[data-mz-root]{--bg:#0B1F33;--surface:#132B45;--text:#F7F9FA;--text2:#D9F3F0;--text3:#8B98A6;--muted:#8B98A6;--line:…;--nav-bg:…;--accent-card:…; …}`
- `app/page.tsx:67` — light override set: `[data-mz-root][data-mz-theme="light"]{--bg:#D9F3F0;--surface:#F7F9FA;--text:#132B45; …}`
- `app/page.tsx:171` — the wrapper element: `<div data-mz-root data-mz-theme={theme} …>`. Toggling `data-mz-theme` between `"dark"` and `"light"` is the *entire* switch; the whole page then reads `var(--bg)`, `var(--text)`, etc. in inline styles.

### State storage & persistence
- **State:** local component state — `const [theme, setTheme] = useState<Theme>('dark')` at `app/page.tsx:107`. No context, no store, no URL param.
- **Persistence:** `localStorage`, key **`mz-theme`**.
  - Read: `app/page.tsx:132-136` — a post-mount `useEffect` does `localStorage.getItem('mz-theme')` and `setTheme(saved)`.
  - Write: `app/page.tsx:162-166` — `toggleTheme` computes the next value, `setTheme(next)`, then `localStorage.setItem('mz-theme', next)`.
- No cookie. Nothing server-side.

### SSR / hydration / flash handling
- The server always renders `theme = 'dark'` (the `useState` initializer). The saved value is read **only after mount**, in `useEffect` (`app/page.tsx:128-136`), explicitly to avoid a hydration mismatch — see the comment at `app/page.tsx:128-131`.
- **Consequence:** there is a real flash-of-wrong-theme (FOWT) for a user whose saved preference is `light` — the first paint is dark, then it snaps to light after hydration. There is **no blocking inline `<script>` in `<head>`** to pre-set the attribute before first paint. The landing page simply accepts the flash. Any student-area solution that wants to avoid the flash needs an anti-FOWT inline script in `app/layout.tsx` (see §6).

### Files / exact hooks involved
| Concern | Location |
|---|---|
| Theme type | `app/page.tsx:15` (`type Theme = 'dark' \| 'light'`) |
| State | `app/page.tsx:107` (`useState`) |
| Persistence read | `app/page.tsx:132-136` (`useEffect` + `localStorage.getItem('mz-theme')`) |
| Persistence write | `app/page.tsx:165` (`localStorage.setItem('mz-theme', next)`) |
| Toggle handler | `app/page.tsx:162-166` (`toggleTheme`) |
| Applied via | `app/page.tsx:171` (`data-mz-theme={theme}` on `[data-mz-root]`) |
| Token definitions | `app/page.tsx:66-67` (inside `PAGE_CSS`) |
| Button | `app/page.tsx:190-196` (`onClick={toggleTheme}`) |

**There is no reusable hook or module.** The pattern is copy-paste-ready but currently exists only here.

---

## 2. Layout / provider scope

### App Router layout tree

```
app/layout.tsx                    ← ROOT. <html className="… dark">, <body>. NO provider. globals.css imported here.
│
├── app/page.tsx                  ← "/" landing. Self-contained theme (see §1). NOT wrapped by any layout beyond root.
│
├── app/(auth)/…                  ← /login, /signup. No group layout. Root layout only.
│
├── app/(admin)/admin/content/layout.tsx   ← admin-only. Role gate. No theme provider.
│   └── app/(admin)/admin/content/page.tsx
│
└── app/(student)/student/layout.tsx       ← wraps children in <DisplayNameProvider> ONLY. No theme provider.
    ├── student/dashboard/page.tsx
    ├── student/profile/page.tsx
    ├── student/exam/page.tsx
    ├── student/catalogue/page.tsx
    ├── student/catalogue/[year]/page.tsx
    ├── student/catalogue/[year]/[moduleCode]/page.tsx
    ├── student/catalogue/[year]/[moduleCode]/[subjectSlug]/page.tsx
    ├── student/quiz/[subjectId]/page.tsx
    ├── student/quiz/chapter/[chapterId]/page.tsx
    └── student/results/histology/page.tsx
```

- There are exactly **three** `layout.tsx` files: `app/layout.tsx`, `app/(admin)/admin/content/layout.tsx`, `app/(student)/student/layout.tsx`.
- `app/(student)/student/layout.tsx` (full contents, 10 lines):
  ```tsx
  import { DisplayNameProvider } from '@/lib/use-display-name';
  export default function StudentLayout({ children }: { children: ReactNode }) {
    return <DisplayNameProvider>{children}</DisplayNameProvider>;
  }
  ```

### Explicit answer to "same provider or different or none?"

**None.** The landing route (`app/page.tsx`) and the student route group (`app/(student)/**`) share **no theme provider or context** — because the landing page *has* no provider to share; its theme state is a local `useState` inside its own component body. The student group is wrapped only by `DisplayNameProvider`. The sole common ancestor is `app/layout.tsx`, which renders a hardcoded `dark` class and no provider.

This is the confirmed root cause of "the toggle does nothing," together with the fact that the buttons have no handler (§3).

---

## 3. The existing toggle button(s)

### 3a. `components/student/StudentNavbar.tsx:145-162` — shared student navbar (profile, exam, all catalogue/quiz pages via `CatalogueShell`)

```tsx
<button
  type="button"
  aria-label="Toggle theme"
  style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
           display: 'flex', alignItems: 'center', justifyContent: 'center',
           color: '#8B98A6', background: 'transparent', cursor: 'pointer' }}
>
  <Moon style={{ width: 15, height: 15 }} />
</button>
```

- **`onClick`?** None.
- **Calls?** Nothing.
- **Hook/context read?** None. The component imports `useRouter`, `useState` (for `signingOut`), `useDisplayName`, `useScrollShadow`, `useNavToast` — **no theme hook**.
- **Icon:** hardcoded `<Moon>` from `lucide-react` (line 6). It never becomes a sun; there is no state to reflect.
- **Diagnosis:** **dead markup.** It was styled to match the landing page's toggle but never wired. The handler, the state, and the target token set are all absent.

### 3b. `app/(student)/student/dashboard/page.tsx:271-288` — dashboard's own inline `Navbar`

Byte-for-byte the same dead button as 3a (same `aria-label`, same inline styles, same static `<Moon>`, no `onClick`). The dashboard defines its own private `Navbar` function component (`app/(student)/student/dashboard/page.tsx:157-346`) rather than using `StudentNavbar`, so the dead button is duplicated. The dashboard `Navbar` *does* wire other buttons (`onToggleView` at line 252, `onLogout` at line 323) — the theme button was simply left unbound.

### 3c. `app/(student)/student/profile/page.tsx:194-200` — "Dark theme" switch (Preferences card)

```tsx
<Toggle
  icon={prefs.theme === 'dark' ? <Moon … /> : <Sun … />}
  label="Dark theme"
  hint="Light theme is coming soon."
  value={prefs.theme === 'dark'}
  onChange={(v) => updatePrefs({ theme: v ? 'dark' : 'light' })}
/>
```

- **`onClick`?** Yes — `updatePrefs({ theme … })` (`app/(student)/student/profile/page.tsx:75-85`).
- **What it does:** merges `{ theme }` into `prefs` state and writes the whole object to `localStorage['medz.studentPrefs']` (`PREF_KEY`, line 15). It is read back on mount at `app/(student)/student/profile/page.tsx:66-72`.
- **What it does NOT do:** apply the theme anywhere. No `data-*` attribute, no class, no CSS var, no cross-page effect. The icon flips Moon/Sun locally and that is all.
- **Diagnosis:** a **preference-only stub.** It stores an intent that nothing consumes. It also uses a **different storage key and shape** from the landing page (`medz.studentPrefs` object vs `mz-theme` string), so a unification pass must reconcile the two.

---

## 4. Dashboard page / component audit

### Method
Per-file scan for hex literals (`#RRGGBB`), `rgba()`, `var(--…)` consumers, and Tailwind `dark:` variants. Every `/student/*` route + every component they import.

### Headline finding
**Nothing in the student area is theme-token-based.** There is no "safe" bucket and effectively no "partial" bucket — the split below is by *how the colour is expressed* (which changes the mechanical effort), not by "some are already fine." Every page renders correctly **only** in dark today and will be unaffected by a working toggle until its colour literals are migrated.

Raw counts (hex literals / `rgba()` literals / `var(--)` consumers / `dark:` variants):

| Route / file | hex | rgba | `var(--)` | `dark:` |
|---|--:|--:|--:|--:|
| `app/(student)/student/dashboard/page.tsx` | 81 | 41 | 0 | 0 |
| `app/(student)/student/quiz/[subjectId]/page.tsx` | 67 | 46 | 0 | 0 |
| `app/(student)/student/quiz/chapter/[chapterId]/page.tsx` | 37 | 24 | 0 | 0 |
| `app/(student)/student/exam/page.tsx` | 28 | 14 | 0 | 0 |
| `app/(student)/student/catalogue/[year]/[moduleCode]/[subjectSlug]/page.tsx` | 26 | 19 | 0 | 0 |
| `app/(student)/student/results/histology/page.tsx` | 24 | 11 | 0 | 0 |
| `app/(student)/student/catalogue/[year]/[moduleCode]/page.tsx` | 22 | 6 | 0 | 0 |
| `app/(student)/student/profile/page.tsx` | 21 | 7 | 0 | 0 |
| `app/(student)/student/catalogue/page.tsx` | 19 | 10 | 0 | 0 |
| `app/(student)/student/catalogue/[year]/page.tsx` | 14 | 13 | 0 | 0 |
| `components/student/StudentNavbar.tsx` | 13 | 3 | 0 | 0 |
| `components/quiz/AITutor.tsx` | 20 | 2 | 0 | 0 (+5 Tailwind semantic classes) |
| `components/quiz/NotesEditor.tsx` | 13 | 1 | 0 | 0 (+5 Tailwind semantic classes) |
| `components/catalogue/CatalogueShell.tsx` | 2 | 3 | 0 | 0 |
| `components/catalogue/CatalogueBreadcrumb.tsx` | 5 | 0 | 0 | 0 |
| `components/ui/NavToast.tsx` | 1 | 4 | 0 | 0 |
| `components/brand/MediZeeLogo.tsx` | 2 | 1 | 0 | 0 |
| `components/skeletons/DashboardSkeleton.tsx` | 2 | 0 | 0 | 0 |
| `components/skeletons/AnalyticsSkeleton.tsx` | 4 | 0 | 0 | 0 |
| `components/skeletons/QuizSkeleton.tsx` | 2 | 0 | 0 | 0 |
| `components/skeletons/AITutorSkeleton.tsx` | 4 | 0 | 0 | 0 |

### Bucket A — already theme-token-based (safe, no change needed)
**Empty.** No file in the student render path reads a swappable token.

The closest thing is `components/ui/*` (`button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`), which use Tailwind semantic classes (`bg-accent`, `text-text-primary`, `bg-surface`, `.glass`). But (a) those classes resolve to **fixed dark hex** in `tailwind.config.js` and to a **fixed dark gradient** in `globals.css` (`.glass`, `app/globals.css:49-57`), so they are not actually swappable, and (b) **none of them are imported by any `/student/*` page** except `NavToast` (used by the dashboard and `StudentNavbar`). They are essentially an unused/admin-oriented primitive set. If a token layer is added to `tailwind.config.js` (see §5/§7 Approach C) they would become swappable "for free" — but they are not on the critical path.

### Bucket B — partially hardcoded (fixable: mix of Tailwind classes + literals)
These use Tailwind utility classes for *some* colours and inline hex for the rest. Migrating them means converting arbitrary values and literal palette classes to tokens, but the structure is class-based so it is less mechanical grunt-work.

| File | Notes / representative lines |
|---|---|
| `app/(student)/student/quiz/[subjectId]/page.tsx` | **HIGH.** The Histology quiz engine. Mixes: Tailwind semantic (`text-text-muted`, `text-white` — `:746,762,764,877`), literal palette (`text-slate-300`, `text-emerald-300`, `bg-black/60`, `hover:bg-red-500/10` — `:780,1079,641,667`), arbitrary hex classes (`text-[#33BFBF]` — `:522,867`), **and** inline hex (`backgroundColor: '#0B1F33'` `:497`; `'#132B45'` `:56,843,895,976,1192`; `'#00A6A6'` `:937,1093`). `document.documentElement` at `:186` is the Fullscreen API, not theming. |
| `app/(student)/student/quiz/chapter/[chapterId]/page.tsx` | **HIGH.** DB-backed chapter quiz. Same mixed style as above; heavy inline hex (`color: '#F7F9FA'`/`'#8B98A6'` throughout — e.g. `:318,398,445,464,584`). `document.documentElement` at `:111` is Fullscreen API. |
| `components/quiz/AITutor.tsx` | **MEDIUM.** 20 hex + 5 Tailwind semantic classes. Loaded lazily inside the quiz pages. |
| `components/quiz/NotesEditor.tsx` | **MEDIUM.** 13 hex + 5 Tailwind semantic classes. Loaded lazily inside both quiz pages. |

### Bucket C — fully hardcoded (needs rework: pure inline-hex, no classes)
Every colour is a literal inside an inline `style` object. There is nothing to "flip" — each value has to be replaced with `var(--token)` (or the element re-expressed as Tailwind classes). This is the bulk of the effort.

| File | Severity | Representative anchors |
|---|---|---|
| `app/(student)/student/dashboard/page.tsx` | **CRITICAL** | Root `<main>` bg `#0B1F33` `:116`; `canvasBg` radial-gradient + `#0B1F33` `:99-104`; `dotTexture` `rgba(255,255,255,0.045)` `:106-113`; inline `Navbar` all greys `#8B98A6`/`#F7F9FA` `:208-338`; `HomeView` hero rings `rgba(0,166,166,…)` `:408-447`, headings `#F7F9FA` `:505,517,568,607,744`; `AnalyticsView` KPI cards `background:'#132B45'` `:667(+),821`; **hand-rolled inline-SVG "Accuracy Trend" chart** with `stroke="#00A6A6"` and `<linearGradient>` stops `~:60-72` of the analytics block; focus-area / recent-challenge rows `#132B45` + status colours `#10B981`/`#F97316`/`#EF4444` `~:189-191`. This is the page the feature is *named after* and it is the single largest concentration of literals. |
| `app/(student)/student/profile/page.tsx` | **HIGH** | `<main>` bg `#0B1F33` `:105`; profile card `#132B45` + `rgba(255,255,255,0.07)` `:118-155`; local `Card`/`Field`/`Toggle` helpers all hardcoded `#132B45`/`#0B1F33`/`#F7F9FA`/`#8B98A6` `:233-350`; danger button `#FCA5A5` / `rgba(239,68,68,…)` `:216-219`. Also the theme switch itself lives here (§3c). |
| `app/(student)/student/exam/page.tsx` | **HIGH** | `<main>` bg `#0B1F33` `:58`; selected/unselected card `rgba(0,166,166,0.14)` vs `#132B45` `:89,188,279`; headings `#F7F9FA`, hints `#8B98A6` `:65-283`. |
| `app/(student)/student/catalogue/page.tsx` | **HIGH** | Headings `#F7F9FA` `:55,138,145,168`; body `#8B98A6` `:58,82,148,192`; year cards. Rendered inside `CatalogueShell`. |
| `app/(student)/student/catalogue/[year]/page.tsx` | **HIGH** | 14 hex / 13 rgba, same pattern. |
| `app/(student)/student/catalogue/[year]/[moduleCode]/page.tsx` | **HIGH** | 22 hex / 6 rgba, same pattern. |
| `app/(student)/student/catalogue/[year]/[moduleCode]/[subjectSlug]/page.tsx` | **HIGH** | 26 hex / 19 rgba, same pattern. |
| `app/(student)/student/results/histology/page.tsx` | **HIGH** | `<main>` bg `#0B1F33` `:135`; cards `#132B45` + `border:'1px solid #132B45'` `:252,391,438`; accent-tinted chips `${accent}25` `:448`; sticky bar `rgba(9,9,14,0.85)` `:360`; palette object with literal `border:'#132B45'`, `color:'#8B98A6'` `:501-511`. |
| `components/student/StudentNavbar.tsx` | **CRITICAL (shared)** | Sticky nav border `rgba(255,255,255,0.06)` `:72`; link greys `#8B98A6`/`#F7F9FA` `:84,115-120`; "My Progress" gradient pill `:135`; avatar gradient `:183`; **the dead toggle button** `:145-162`. Used by profile, exam, and all catalogue/quiz pages via `CatalogueShell`. Fixing this one file covers the nav on ~8 pages. |
| `components/catalogue/CatalogueShell.tsx` | **HIGH (shared)** | Outer `background:'#0B1F33'` `:12`; radial-gradient wrapper + `#0B1F33` `:18-21`; `dotTexture` `rgba(255,255,255,0.045)` `:30`. Wraps 6 pages. |
| `components/catalogue/CatalogueBreadcrumb.tsx` | **MEDIUM (shared)** | `color:'#8B98A6'` `:15,25`; active `#33BFBF` `:29`; separator `#4A5A6B` `:33`. |
| `components/ui/NavToast.tsx` | **MEDIUM (shared)** | Toast surface `rgba(13,11,26,0.92)` `:56`, border `rgba(0,166,166,0.4)` `:59`, text `#F7F9FA` `:61`. Rendered by dashboard + `StudentNavbar`. |
| `components/brand/MediZeeLogo.tsx` | **LOW** | Brand gradient `#00A6A6→#33BFBF` `:38` — brand colour, likely stays identical in both themes; only the wordmark text colour (if any) needs review. |
| `components/skeletons/DashboardSkeleton.tsx` | **MEDIUM** | Card `#0F0F1A` + `border:'#1E1E2E'` `:59` — note this is a **different dark palette** (`#0F0F1A`/`#1E1E2E`) than the rest of the app's navy (`#0B1F33`/`#132B45`); pre-existing inconsistency. Also depends on `.skeleton-shimmer` (`app/globals.css:115-128`), a hardcoded `#132B45`/`#2D2D3F` gradient. |
| `components/skeletons/AnalyticsSkeleton.tsx` / `QuizSkeleton.tsx` / `AITutorSkeleton.tsx` | **LOW–MEDIUM** | 2–4 hex each + shared `.skeleton-shimmer`. Whether these are on the student path depends on where each is imported (`AITutorSkeleton` is imported by `quiz/[subjectId]`); confirm during implementation. |

### Third-party UI components that may not follow the app theme
- **Recharts** — present in `package.json` and used in `components/dashboard/Analytics.tsx` and `components/dashboard/PlatformStatsPanel.tsx`. **Both are admin-only** (`PlatformStatsPanel` self-documents as "extracted from the admin dashboard page"); **neither is imported by any `/student/*` route.** The student dashboard's "Accuracy Trend" is a **hand-rolled inline `<svg><path>`**, not Recharts. So Recharts is *not* a student-dashboard concern today — but if analytics is ever moved onto Recharts, its axis/grid/tooltip colours are set via props and will need explicit light/dark values.
- **framer-motion** — used in `app/(student)/student/quiz/[subjectId]/page.tsx`, `app/(student)/student/results/histology/page.tsx`, `components/ui/NavToast.tsx`, `components/quiz/NotesEditor.tsx`, `components/quiz/AITutor.tsx`. It animates layout/opacity, not colour, so it does not fight a theme system — but any hardcoded colour inside `animate`/`style` props on motion elements is just another literal to migrate.
- **lucide-react** icons — inherit `color`/`currentColor` from inline styles; they will follow whatever the parent colour token resolves to once migrated. No special handling.
- **Radix primitives** (`@radix-ui/react-*`) — unstyled; they inherit from the `components/ui/*` wrappers, which are off the student path. No special handling.

**Net:** there is no charting/date-picker/modal library rendering its own un-themeable surface on the student dashboard today. The only real "third-party" risk is future Recharts adoption.

---

## 5. Global config

| File | Relevance to theming |
|---|---|
| `app/globals.css` | `@tailwind base/components/utilities`. `:root` block (`:6-23`) hardcodes `color-scheme: dark` and a set of `--bg-primary`, `--card-bg`, `--text-primary`, … tokens — **all dark, no light counterpart, and no `.dark`/`.light`/`[data-*]`/`@media` override anywhere in the file.** `html, body { @apply bg-background text-text-primary }` (`:29-33`) pins the page to the (dark) Tailwind tokens. Utility classes `.glass` / `.glass-strong` (`:49-79`) are hardcoded dark gradients. `.mz-nav-scroll.is-scrolled` (`:96-99`) hardcodes `rgba(11,31,51,0.85)`. `.skeleton-shimmer` (`:115-128`) hardcodes `#132B45`/`#2D2D3F`. **This file is where a light token set has to be added.** |
| `tailwind.config.js` | `darkMode: ['class']` (`:3`) — the class strategy is configured but unused (nothing toggles the class; there is no light palette). `theme.extend.colors` (`:16-58`) maps every semantic name (`background`, `surface`, `accent`, `card`, `muted`, `primary`, `secondary`, `destructive`, `text-primary`, `text-muted`, `border`, `input`, `ring`, `foreground`) to a **literal dark hex**. To make Tailwind classes theme-aware, these must become `var(--…)` references (e.g. `background: 'hsl(var(--background))'` or `'rgb(var(--background) / <alpha-value>)'`) with the actual values moved into `globals.css` light/dark blocks. |
| `postcss.config.js` | `tailwindcss` + `autoprefixer` only. No theming role. |
| `app/layout.tsx` | `<html lang="en" className="… dark">` (`:32`) — the permanent `dark` class. `<body className="min-h-screen bg-background text-text-primary">` (`:33`) + a fixed decorative background layer (`:34-38`) using `bg-accent/20`, `bg-success/10`. This is the file that must host the anti-FOWT inline script and (for a context-based solution) the `ThemeProvider`. |
| `app/page.tsx:65-101` | The **only** existing light token definitions in the repo (`[data-mz-root][data-mz-theme="light"]`, `:67`). Any shared solution should lift these values as the canonical light palette so landing and student don't drift. |
| `lib/use-display-name.tsx` | The one existing client-context pattern in the repo (`createContext` + provider in a layout). A `ThemeProvider` would mirror its shape. |
| `.env*`, `next.config.js`, `proxy.ts` | No theming role. |

---

## 6. Recommended fix for the provider / scope problem

The provider is the *small* part. Pick the provider approach on risk/consistency grounds; budget the real time for the literal migration (§4 Buckets B + C).

### Approach A — Local mirror in the student layout (fastest, lowest risk)
Recreate the landing pattern, scoped to `/student`.

- Convert `app/(student)/student/layout.tsx` to compose a new **`StudentThemeProvider` client component** (keep `DisplayNameProvider` too). The provider holds `useState<Theme>`, reads/writes `localStorage['mz-theme']` (reuse the landing key), and renders `<div data-mz-root data-mz-theme={theme}>` (or sets the attribute on `document.documentElement`).
- Add a `[data-mz-theme="light"]` token block to `app/globals.css` (values lifted from `app/page.tsx:67`), plus the matching dark defaults on `[data-mz-theme="dark"]` / `:root`.
- Expose `useTheme()` (context). Wire the two dead buttons (`components/student/StudentNavbar.tsx:145`, `app/(student)/student/dashboard/page.tsx:271`) and the profile switch (`app/(student)/student/profile/page.tsx:194`) to `toggleTheme` / `setTheme`.
- Migrate §4 literals to `var(--token)`.

**Pros:** minimal blast radius (nothing outside `/student` changes); mirrors a pattern already shipped and understood; no change to `tailwind.config.js`; the landing page keeps working untouched. **Cons:** two theme implementations now exist (landing local + student provider) even if they share the token values and the `localStorage` key; `components/ui/*` stay non-swappable (irrelevant on this path); still inherits the landing page's first-paint flash unless you also do the §6 anti-FOWT script.

### Approach B — One shared `ThemeProvider` at the root (most consistent)
- New `components/theme/ThemeProvider.tsx` (client): context + `localStorage['mz-theme']` + sets `data-mz-theme` on `<html>`.
- Render it in `app/layout.tsx` around `{children}`. Add an anti-FOWT inline `<script>` in `<head>` that reads `localStorage` and sets the attribute before first paint (this also removes the landing page's existing flash).
- Add light/dark token blocks to `app/globals.css` keyed on `[data-mz-theme="…"]`.
- **Refactor `app/page.tsx` to consume the shared context** and delete its local `useState` + the `[data-mz-root]` scoping from `PAGE_CSS` (keep the token names or alias them).
- Wire the three student controls; migrate §4 literals.

**Pros:** single source of truth; landing + student + (later) auth/admin all covered; flash fixed everywhere. **Cons:** touches the working landing page (regression surface — needs its own visual QA); bigger review.

### Approach C — Make Tailwind tokens theme-aware (align with `darkMode: ['class']`)
Do Approach B, **and** rewrite `tailwind.config.js` colours to `var(--…)` references with values in `globals.css` under `:root` / `.dark` (or `[data-theme]`). Flip the class/attribute from the provider. Then student pages *can* be migrated to Tailwind classes instead of inline `var(--token)`.

**Pros:** `components/ui/*`, `.glass`, and any future class-based UI become theme-aware for free; idiomatic. **Cons:** largest change; every student page is currently inline-`style`d, not class-based, so you either (a) still hand-migrate each literal to `var(--token)` in the `style` object — in which case the config rewrite buys little for *this* feature — or (b) additionally re-express pages as Tailwind classes (a much bigger refactor). Highest regression risk (the config change affects every surface at once, including admin and auth).

### Recommendation
**Approach A now**, with the token values and `localStorage` key deliberately shared with the landing page so there is one palette and one key. It gets a *working, correct* toggle on the student dashboard with the smallest risk and without reopening the known-good landing page. Fold in the **anti-FOWT inline script from Approach B** (small, self-contained, and it also fixes the landing flash) if flash-free first paint is in scope. Treat Approach C as a separate, later "make the whole app themeable" project — it is not required to ship this feature and its risk/scope is disproportionate here.

Regardless of approach, the gating effort is §4: ~400+ hex + ~200+ rgba literals across 10 pages and ~8 shared components. Sequence it shared-components-first so each fix lights up multiple pages.

---

## 7. Ordered implementation checklist

**Phase 0 — Decide & set tokens**
1. Choose Approach A / B / C (recommend A). Confirm whether flash-free first paint is in scope.
2. In `app/globals.css`, define the canonical token contract on `:root` / `[data-mz-theme="dark"]` (dark, from `app/page.tsx:66`) and `[data-mz-theme="light"]` (light, from `app/page.tsx:67`). Name every token the student UI needs: `--bg`, `--bg-2`, `--surface`, `--card`, `--card-hover`, `--text`, `--text-2`, `--text-muted`, `--line`, `--line-strong`, `--fill`, `--nav-bg`, `--accent`, `--accent-2`, `--success`, `--warning`, `--error`, plus any tinted-overlay helpers.
3. Keep `color-scheme` in sync (`app/globals.css:7`) — set it per theme block, not hardcoded `dark`.

**Phase 1 — Provider & persistence**
4. Create the theme provider (`StudentThemeProvider` for A, root `ThemeProvider` for B/C): `useState<Theme>`, `useTheme()` context, read/write `localStorage['mz-theme']`, apply `data-mz-theme` (on the student wrapper for A, on `<html>` for B/C).
5. Compose it: `app/(student)/student/layout.tsx` (A) or `app/layout.tsx` (B/C). Keep `DisplayNameProvider`.
6. (If flash-free in scope) add the anti-FOWT inline `<script>` to `app/layout.tsx` `<head>`.
7. Reconcile the profile key: on mount, migrate any `localStorage['medz.studentPrefs'].theme` into `mz-theme`, then have the profile switch call `setTheme` (keep writing the pref object if other prefs live there).

**Phase 2 — Wire the controls**
8. `components/student/StudentNavbar.tsx:145-162` — add `onClick={toggleTheme}`; swap the static `<Moon>` for `theme === 'light' ? <Moon/> : <Sun/>` (match landing's `app/page.tsx:191-195`).
9. `app/(student)/student/dashboard/page.tsx:271-288` — same. (Or delete the dashboard's private `Navbar` and switch it to `StudentNavbar` to kill the duplication — separate call.)
10. `app/(student)/student/profile/page.tsx:194-200` — `onChange` calls `setTheme`; update the hint text ("Light theme is coming soon." is now false).

**Phase 3 — Migrate colour literals (shared first)**
11. `components/catalogue/CatalogueShell.tsx` — bg, radial gradients, dot texture → tokens. (Lights up 6 pages.)
12. `components/student/StudentNavbar.tsx` — nav border, link greys, pills, avatar → tokens. (Lights up ~8 pages.)
13. `components/catalogue/CatalogueBreadcrumb.tsx`, `components/ui/NavToast.tsx` → tokens.
14. `app/globals.css` — `.glass`, `.glass-strong`, `.mz-nav-scroll.is-scrolled`, `.skeleton-shimmer` → token-based light/dark variants.
15. Skeletons (`components/skeletons/*`) → tokens; while here, reconcile `DashboardSkeleton`'s odd `#0F0F1A`/`#1E1E2E` with the app navy.

**Phase 4 — Migrate per-page literals**
16. `app/(student)/student/dashboard/page.tsx` — `canvasBg`, `dotTexture`, inline `Navbar`, `HomeView`, `AnalyticsView`, and the inline-SVG "Accuracy Trend" (`stroke`, `<linearGradient>` stops, axis label greys) → tokens. Highest literal count; do it in sections (nav → hero → catalogue strip → analytics).
17. `app/(student)/student/profile/page.tsx` — `<main>`, profile card, local `Card`/`Field`/`Toggle`, danger button → tokens.
18. `app/(student)/student/exam/page.tsx` — `<main>`, selectable cards, headings/hints → tokens.
19. `app/(student)/student/catalogue/page.tsx` + `[year]` + `[year]/[moduleCode]` + `[year]/[moduleCode]/[subjectSlug]` → tokens.
20. `app/(student)/student/results/histology/page.tsx` — cards, borders, accent-tint chips, sticky bar, palette object → tokens.
21. `app/(student)/student/quiz/[subjectId]/page.tsx` — reconcile the Tailwind-class + arbitrary-hex + inline-hex mix; literal palette classes (`text-slate-300`, `text-emerald-300`, `bg-black/60`) → tokens; leave the `document.documentElement` Fullscreen calls alone.
22. `app/(student)/student/quiz/chapter/[chapterId]/page.tsx` — same.
23. `components/quiz/AITutor.tsx`, `components/quiz/NotesEditor.tsx` — hex + semantic classes → tokens.

**Phase 5 — Verify**
24. Toggle from every entry point (dashboard nav, `StudentNavbar` on each page type, profile switch); confirm one shared state, persistence across reload, and cross-page consistency (dashboard → catalogue → quiz → profile).
25. Reload on a `light` preference and watch first paint for flash (should be none if Phase 1 step 6 done; expected on the landing page only if Approach A without the script).
26. Check contrast in light mode on: accent-on-surface text, muted text, borders (`rgba(255,255,255,…)` lines become invisible on light — they must map to a dark-ink line token, not just be inverted), status colours (`#10B981`/`#F97316`/`#EF4444` on light backgrounds), glass panels, skeleton shimmer, and the inline-SVG chart.
27. `prefers-reduced-motion` still respected (`app/globals.css:274-281`).
28. Confirm the landing page (`app/page.tsx`) is visually unchanged (critical for Approach B/C; a no-op sanity check for A).
29. `npm run lint` + typecheck; visual QA in the browser preview.

---

## Appendix — files read during this investigation

`package.json`, `tailwind.config.js`, `postcss.config.js`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/(student)/student/layout.tsx`, `app/(admin)/admin/content/layout.tsx`, `app/(student)/student/dashboard/page.tsx`, `app/(student)/student/profile/page.tsx`, `components/student/StudentNavbar.tsx`, `components/catalogue/CatalogueShell.tsx`, `components/catalogue/CatalogueBreadcrumb.tsx`, `components/ui/card.tsx`, `components/ui/button.tsx`; grep-level scans of all 10 `app/(student)/student/**/page.tsx`, all `components/**`, and `lib/**` for `theme|dark|light|prefers-color-scheme|useTheme|next-themes|createContext|ThemeProvider|mz-theme|data-mz|documentElement|classList`, plus per-file hex/`rgba()`/`var(--)`/`dark:` counts.
