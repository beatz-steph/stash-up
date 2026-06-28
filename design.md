# StashUp Design System

Institutional visual language for a digital Ajo/Esusu savings platform.
The brand reads as **calm, trustworthy fintech** — white canvas, single blue accent, pill geometry everywhere, near-black dark heroes for key moments.

All tokens are prefixed `su-` to coexist with shadcn/ui without conflict.
CSS variables live in `packages/ui/src/styles/globals.css`.

---

## Brand Voice

- **Institutional calm** — trustworthy place to save with your community. Not a gimmick, not a hustle app.
- **Single accent** — StashUp Blue (`#0052ff`) carries every primary CTA. Used scarcely; one or two blue moments per page section.
- **Pill geometry** — every button is fully rounded (`rounded-su-pill`). Cards sit at `rounded-su-xl`. Sharp corners are absent.
- **Three-mode rhythm** — pages rotate: white canvas → soft-gray elevation band → full-bleed dark hero.
- **Monospace for money** — every Naira amount uses `font-feature-settings: 'tnum'` with Geist Mono for tabular alignment.

---

## Typography

- **Satoshi** (local variable font, weights 300–900) is the single typeface for everything — display headings, the StashUp wordmark, body copy, form fields, labels, buttons, navigation, and captions. Hierarchy comes from size + weight + color.
- **Geist Mono** is used for currency values and numbers.

### Setup (Next.js)

Satoshi ships as a variable font and is loaded in both app layouts via `next/font/local` from `app/fonts/`, exposed as the CSS variable `--font-sans`:

```tsx
// apps/web/app/layout.tsx  &  apps/admin/app/layout.tsx
import localFont from "next/font/local"

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Variable.woff2", weight: "300 900", style: "normal" },
    { path: "./fonts/Satoshi-VariableItalic.woff2", weight: "300 900", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
})
```

The font variables are remapped in `globals.css` so you can use the standard Tailwind font family utilities.

### Font Families

| Token | CSS Variable | Tailwind | Use |
|---|---|---|---|
| Sans (primary) | `--font-su-sans` | `font-su-sans` | Satoshi — body, nav, buttons, captions, inputs |
| Display | `--font-su-display` | `font-su-display` | Satoshi — display headlines & wordmark (use `font-bold`) |
| Mono | `--font-su-mono` | `font-su-mono` | Geist Mono — Naira amounts and numbers (with `[font-feature-settings:'tnum']`) |

### Type Scale

Font-size tokens are registered under Tailwind v4's `--text-*` namespace (in `globals.css`) and generate `text-su-*` utilities. Combine with weight, line-height, and tracking as shown.

| Style | Tailwind Size | Weight | Line Height | Tracking | Family |
|---|---|---|---|---|---|
| `display-mega` | `text-su-display-mega` | `font-normal` | `leading-none` | `tracking-su-display-mega` | `font-su-display` |
| `display-xl` | `text-su-display-xl` | `font-normal` | `leading-none` | `tracking-su-display-xl` | `font-su-display` |
| `display-lg` | `text-su-display-lg` | `font-normal` | `leading-none` | `tracking-su-display-lg` | `font-su-display` |
| `display-md` | `text-su-display-md` | `font-normal` | `leading-[1.09]` | `tracking-su-display-md` | `font-su-display` |
| `display-sm` | `text-su-display-sm` | `font-normal` | `leading-[1.11]` | `tracking-su-display-sm` | `font-su-sans` |
| `title-lg` | `text-su-title-lg` | `font-normal` | `leading-[1.13]` | `tracking-su-title-lg` | `font-su-sans` |
| `title-md` | `text-su-title-md` | `font-semibold` | `leading-[1.33]` | `tracking-normal` | `font-su-sans` |
| `title-sm` | `text-su-title-sm` | `font-semibold` | `leading-[1.25]` | `tracking-normal` | `font-su-sans` |
| `body-md` | `text-su-body-md` | `font-normal` | `leading-relaxed` | `tracking-normal` | `font-su-sans` |
| `body-strong` | `text-su-body-md` | `font-bold` | `leading-relaxed` | `tracking-normal` | `font-su-sans` |
| `body-sm` | `text-su-body-sm` | `font-normal` | `leading-relaxed` | `tracking-normal` | `font-su-sans` |
| `caption` | `text-su-caption` | `font-normal` | `leading-relaxed` | `tracking-normal` | `font-su-sans` |
| `caption-strong` | `text-su-caption-sm` | `font-semibold` | `leading-relaxed` | `tracking-normal` | `font-su-sans` |
| `number-display` | `text-su-number` | `font-medium` | `leading-[1.4]` | `tracking-normal` | `font-su-mono [font-feature-settings:'tnum']` |
| `button` | `text-su-button` | `font-semibold` | `leading-[1.15]` | `tracking-normal` | `font-su-sans` |
| `nav-link` | `text-su-nav` | `font-medium` | `leading-[1.4]` | `tracking-normal` | `font-su-sans` |

### Complete Class Strings

```
display-mega:    font-su-display text-su-display-mega font-normal leading-none tracking-su-display-mega
display-xl:      font-su-display text-su-display-xl font-normal leading-none tracking-su-display-xl
display-lg:      font-su-display text-su-display-lg font-normal leading-none tracking-su-display-lg
display-md:      font-su-display text-su-display-md font-normal leading-[1.09] tracking-su-display-md
display-sm:      font-su-sans text-su-display-sm font-normal leading-[1.11] tracking-su-display-sm
title-lg:        font-su-sans text-su-title-lg font-normal leading-[1.13] tracking-su-title-lg
title-md:        font-su-sans text-su-title-md font-semibold leading-[1.33]
title-sm:        font-su-sans text-su-title-sm font-semibold leading-[1.25]
body-md:         font-su-sans text-su-body-md font-normal leading-relaxed
body-strong:     font-su-sans text-su-body-md font-bold leading-relaxed
body-sm:         font-su-sans text-su-body-sm font-normal leading-relaxed
caption:         font-su-sans text-su-caption font-normal leading-relaxed
caption-strong:  font-su-sans text-su-caption-sm font-semibold leading-relaxed
number-display:  font-su-mono text-su-number font-medium leading-[1.4] [font-feature-settings:'tnum']
button:          font-su-sans text-su-button font-semibold leading-[1.15]
nav-link:        font-su-sans text-su-nav font-medium leading-[1.4]
```

---

## Colors

All available as Tailwind utilities: `bg-su-*` · `text-su-*` · `border-su-*` · `ring-su-*`

### Brand

| Token | CSS Variable | Hex | Tailwind | Use |
|---|---|---|---|---|
| Primary | `--su-primary` | `#0052ff` | `bg-su-primary` / `text-su-primary` | Primary CTA pills, brand links |
| Primary Active | `--su-primary-active` | `#003ecc` | `bg-su-primary-active` | Press state on primary CTAs |
| Primary Disabled | `--su-primary-disabled` | `#a8b8cc` | `bg-su-primary-disabled` | Disabled CTA fill |

### Text

| Token | CSS Variable | Hex | Tailwind | Use |
|---|---|---|---|---|
| Ink | `--su-ink` | `#0a0b0d` | `text-su-ink` | Display heads, nav, emphasis |
| Body | `--su-body` | `#5b616e` | `text-su-body` | Default running text |
| Body Strong | `--su-body-strong` | `#0a0b0d` | `text-su-body-strong` | Bold body emphasis |
| Muted | `--su-muted` | `#7c828a` | `text-su-muted` | Sub-labels, secondary nav |
| Muted Soft | `--su-muted-soft` | `#a8acb3` | `text-su-muted-soft` | Disabled text, fine print |
| On Primary | `--su-on-primary` | `#ffffff` | `text-su-on-primary` | Text on blue CTAs |
| On Dark | `--su-on-dark` | `#ffffff` | `text-su-on-dark` | Text on dark heroes |
| On Dark Soft | `--su-on-dark-soft` | `#a8acb3` | `text-su-on-dark-soft` | Secondary text on dark |

### Surface

| Token | CSS Variable | Hex | Tailwind | Use |
|---|---|---|---|---|
| Canvas | `--su-canvas` | `#ffffff` | `bg-su-canvas` | Default page floor |
| Surface Soft | `--su-surface-soft` | `#f7f7f7` | `bg-su-surface-soft` | Alternating gray band |
| Surface Card | `--su-surface-card` | `#ffffff` | `bg-su-surface-card` | Card face (white) |
| Surface Strong | `--su-surface-strong` | `#eef0f3` | `bg-su-surface-strong` | Secondary button fill, search pill, icon plates |
| Surface Dark | `--su-surface-dark` | `#0a0b0d` | `bg-su-surface-dark` | Dark hero bands, featured pricing tier |
| Surface Dark Elevated | `--su-surface-dark-elevated` | `#16181c` | `bg-su-surface-dark-elevated` | Cards floating inside dark heroes |

### Hairline

| Token | CSS Variable | Hex | Tailwind | Use |
|---|---|---|---|---|
| Hairline | `--su-hairline` | `#dee1e6` | `border-su-hairline` | Default 1px dividers on white |
| Hairline Soft | `--su-hairline-soft` | `#eef0f3` | `border-su-hairline-soft` | Very subtle dividers |

### Semantic

| Token | CSS Variable | Hex | Tailwind | Use |
|---|---|---|---|---|
| Semantic Up | `--su-semantic-up` | `#05b169` | `text-su-semantic-up` | Paid / on-track / positive — **text only** |
| Semantic Down | `--su-semantic-down` | `#cf202f` | `text-su-semantic-down` | Missed / overdue / negative — **text only** |
| Accent Yellow | `--su-accent-yellow` | `#f4b000` | `text-su-accent-yellow` | Illustrative accent (icons) — never CTA |

> **Rule:** `semantic-up` and `semantic-down` are text colors only. Never use them as button backgrounds or card fills.

---

## Border Radius

| Token | CSS Variable | px | Tailwind | Use |
|---|---|---|---|---|
| None | `--radius-su-none` | 0px | `rounded-su-none` | (unused) |
| XS | `--radius-su-xs` | 4px | `rounded-su-xs` | Inline tags |
| SM | `--radius-su-sm` | 8px | `rounded-su-sm` | Compact rows |
| MD | `--radius-su-md` | 12px | `rounded-su-md` | Form inputs |
| LG | `--radius-su-lg` | 16px | `rounded-su-lg` | Mid-size cards |
| XL | `--radius-su-xl` | 24px | `rounded-su-xl` | Feature cards, product mockups, pricing tiers |
| Pill | `--radius-su-pill` | 100px | `rounded-su-pill` | All CTA buttons, search pills, badges |
| Full | `--radius-su-full` | 9999px | `rounded-su-full` | Member avatars, status icon circles |

> **Rule:** Interactive elements → `rounded-su-pill`. Card containers → `rounded-su-xl`. Avatars/icons → `rounded-su-full`. Never use `rounded-none` on CTAs.

---

## Spacing

All spacing tokens work with every Tailwind spacing utility: `p-*`, `m-*`, `gap-*`, `py-*`, `px-*`, `w-*`, `h-*`, etc.

| Token | CSS Variable | px | Tailwind | Use |
|---|---|---|---|---|
| XXS | `--spacing-su-xxs` | 4px | `p-su-xxs` | Micro gap |
| XS | `--spacing-su-xs` | 8px | `p-su-xs` | Tight gap |
| SM | `--spacing-su-sm` | 12px | `p-su-sm` | Small component padding |
| Base | `--spacing-su-base` | 16px | `p-su-base` | Default element padding |
| MD | `--spacing-su-md` | 20px | `p-su-md` | Comfortable padding |
| LG | `--spacing-su-lg` | 24px | `p-su-lg` | Card gap, component spacing |
| XL | `--spacing-su-xl` | 32px | `p-su-xl` | Card internal padding |
| XXL | `--spacing-su-xxl` | 48px | `p-su-xxl` | CTA band internal padding |
| Section | `--spacing-su-section` | 96px | `py-su-section` | Between every major page band |

---

## Component Recipes

Complete Tailwind class strings for every component. Use these verbatim when building UI.

### Buttons

```tsx
// button-primary — StashUp Blue pill CTA
<button className="bg-su-primary text-su-on-primary font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-5 py-3 h-11 transition-colors hover:bg-su-primary-active disabled:bg-su-primary-disabled disabled:cursor-not-allowed">
  Join Circle
</button>

// button-primary-lg — hero pill CTA (taller, more prominent)
<button className="bg-su-primary text-su-on-primary font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-8 py-4 h-14 transition-colors hover:bg-su-primary-active">
  Start Saving
</button>

// button-secondary — soft gray on white pages
<button className="bg-su-surface-strong text-su-ink font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-5 py-3 h-11 transition-colors hover:bg-su-hairline">
  Learn More
</button>

// button-secondary-dark — inside dark hero bands
<button className="bg-su-surface-dark-elevated text-su-on-dark font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-5 py-3 h-11 transition-colors hover:bg-su-muted/20">
  Explore Circles
</button>

// button-outline-dark — ghost pill on dark surfaces
<button className="bg-transparent text-su-on-dark border border-white/40 font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-5 py-[11px] h-11 transition-colors hover:border-white/70">
  Sign In
</button>

// button-tertiary — text-link CTA
<button className="bg-transparent text-su-primary font-su-sans text-su-button font-semibold">
  View all circles →
</button>
```

### Navigation

```tsx
// top-nav-light — white page nav
<nav className="bg-su-canvas h-16 border-b border-su-hairline-soft px-su-xl flex items-center justify-between">
  <span className="font-su-display text-su-ink font-normal">StashUp</span>
  <div className="flex items-center gap-su-lg">
    <a className="font-su-sans text-su-nav font-medium text-su-body leading-[1.4]">How it works</a>
  </div>
</nav>

// top-nav-dark — over dark hero
<nav className="bg-su-surface-dark h-16 px-su-xl flex items-center justify-between">
  <span className="font-su-display text-su-on-dark font-normal">StashUp</span>
</nav>
```

### Hero Bands

```tsx
// hero-band-dark — signature dark hero with product mockup
<section className="bg-su-surface-dark text-su-on-dark py-su-section px-su-xl">
  <h1 className="font-su-display text-su-display-mega font-normal leading-none tracking-su-display-mega text-su-on-dark max-w-2xl">
    Save together, win together.
  </h1>
  <p className="font-su-sans text-su-body-md font-normal leading-relaxed text-su-on-dark-soft mt-su-lg max-w-xl">
    StashUp brings your Ajo circle online — automated contributions, transparent payouts, zero drama.
  </p>
  <div className="flex gap-su-md mt-su-xl">
    {/* button-primary-lg + button-outline-dark */}
  </div>
</section>

// hero-band-light — white canvas hero
<section className="bg-su-canvas text-su-ink py-su-section px-su-xl">
  <h1 className="font-su-display text-su-display-xl font-normal leading-none tracking-su-display-xl text-su-ink max-w-2xl">
    The smarter savings circle.
  </h1>
</section>
```

### Cards

```tsx
// product-ui-card-dark — floating inside dark hero
<div className="bg-su-surface-dark-elevated text-su-on-dark rounded-su-xl p-su-xl">
  {/* real product UI */}
</div>

// feature-card — 2-up or 3-up grid, white with hairline
<div className="bg-su-surface-card text-su-ink rounded-su-xl p-su-xl border border-su-hairline">
  <h3 className="font-su-sans text-su-title-md font-semibold leading-[1.33] text-su-ink">
    Automated contributions
  </h3>
  <p className="font-su-sans text-su-body-md font-normal leading-relaxed text-su-body mt-su-xs">
    Never miss a turn — direct debit handles every cycle.
  </p>
</div>

// pricing-tier-card — standard tier
<div className="bg-su-canvas rounded-su-xl p-su-xl border border-su-hairline">
  <p className="font-su-sans text-su-title-md font-semibold text-su-ink">Free</p>
  <p className="font-su-display text-su-display-sm font-normal tracking-su-display-sm text-su-ink mt-su-sm">₦0</p>
</div>

// pricing-tier-featured — dark inversion for highlighted plan
<div className="bg-su-surface-dark rounded-su-xl p-su-xl">
  <p className="font-su-sans text-su-title-md font-semibold text-su-on-dark">Pro</p>
</div>
```

### Circle / Member Rows

```tsx
// member-row — contribution status list
<div className="flex items-center gap-su-md py-su-base border-b border-su-hairline last:border-0">
  {/* avatar */}
  <div className="w-8 h-8 rounded-su-full bg-su-surface-strong flex items-center justify-center shrink-0">
    <span className="font-su-sans text-su-caption-sm font-semibold text-su-ink">AB</span>
  </div>
  {/* name + position */}
  <div className="flex-1 min-w-0">
    <p className="font-su-sans text-su-title-sm font-semibold text-su-ink truncate">Aisha Bello</p>
    <p className="font-su-sans text-su-body-sm font-normal text-su-muted">Slot 3 of 12</p>
  </div>
  {/* amount + status */}
  <div className="text-right">
    <p className="font-su-mono text-su-number font-medium text-su-ink [font-feature-settings:'tnum']">₦25,000</p>
    <p className="font-su-mono text-su-caption font-medium text-su-semantic-up [font-feature-settings:'tnum']">Paid</p>
  </div>
</div>

// positive delta (paid / on-track)
<span className="font-su-mono text-su-number font-medium text-su-semantic-up [font-feature-settings:'tnum']">+₦25,000</span>

// negative delta (missed / overdue)
<span className="font-su-mono text-su-number font-medium text-su-semantic-down [font-feature-settings:'tnum']">Overdue</span>
```

### Forms

```tsx
// text-input
<input className="bg-su-canvas text-su-ink font-su-sans text-su-body-md font-normal rounded-su-md px-4 py-[14px] h-12 border border-su-hairline w-full
  focus:outline-none focus:border-su-primary focus:ring-2 focus:ring-su-primary/20
  placeholder:text-su-muted" />

// search-input-pill
<input className="bg-su-surface-strong text-su-ink font-su-sans text-su-body-md font-normal rounded-su-pill px-5 py-3 h-11 border-0 w-full
  focus:outline-none focus:ring-2 focus:ring-su-primary/20
  placeholder:text-su-muted" />
```

### Badges & Tags

```tsx
// badge-pill — circle status (ACTIVE, PENDING, COMPLETED)
<span className="bg-su-surface-strong text-su-ink font-su-sans text-su-caption-sm font-semibold leading-relaxed rounded-su-pill px-3 py-1">
  ACTIVE
</span>

// badge-up — paid / on-track
<span className="bg-su-semantic-up/10 text-su-semantic-up font-su-sans text-su-caption-sm font-semibold rounded-su-pill px-3 py-1">
  PAID
</span>

// badge-down — missed / overdue
<span className="bg-su-semantic-down/10 text-su-semantic-down font-su-sans text-su-caption-sm font-semibold rounded-su-pill px-3 py-1">
  OVERDUE
</span>

// avatar / icon circle
<div className="w-8 h-8 rounded-su-full bg-su-surface-strong flex items-center justify-center" />
```

### CTA Band & Footer

```tsx
// cta-band-dark — pre-footer dark band
<section className="bg-su-surface-dark py-su-section px-su-xl text-center">
  <h2 className="font-su-display text-su-display-lg font-normal leading-none tracking-su-display-lg text-su-on-dark">
    Ready to start your circle?
  </h2>
  <div className="flex gap-su-md justify-center mt-su-xl">
    {/* button-primary-lg + button-outline-dark */}
  </div>
</section>

// footer
<footer className="bg-su-canvas py-16 px-12 border-t border-su-hairline-soft">
  <p className="font-su-sans text-su-body-sm font-normal text-su-body">
    © 2026 StashUp. All rights reserved.
  </p>
</footer>

// legal-band
<div className="font-su-sans text-su-caption font-normal text-su-muted">
  StashUp is not a licensed deposit-taking institution.
</div>
```

---

## Elevation & Depth

| Level | CSS | When |
|---|---|---|
| Flat | (no shadow, no border) | 80% of surfaces |
| Hairline | `border border-su-hairline` | Feature cards, inputs on white |
| Soft drop | `shadow-[0_4px_12px_rgba(0,0,0,0.04)]` | Hovered or elevated cards |
| Dark inversion | `bg-su-surface-dark` | Featured pricing tier, dark heroes — no shadow needed |

---

## Page Rhythm

Every page alternates between three modes. Never stack two identical modes.

```
1. White section   — bg-su-canvas        py-su-section
2. Gray band       — bg-su-surface-soft  py-su-section
3. Dark hero       — bg-su-surface-dark  py-su-section  (product mockups inside)
```

**Standard landing page order:**
```
[dark hero] → [white features] → [gray elevation band] → [white pricing] → [dark CTA band] → [white footer]
```

---

## Numbers & Money

Every financial figure — Naira amounts, percentages, slot counts — must use:

```tsx
className="font-su-mono text-su-number font-medium [font-feature-settings:'tnum']"
```

Format amounts as `₦10,000.00`. Never expose raw kobo integers to the UI (divide by 100 first).

```tsx
function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}
```

---

## Responsive Breakpoints

| Name | Width | Key changes |
|---|---|---|
| Mobile | `< 640px` | Hero h1 → `text-su-display-sm`; cards 1-up; nav collapses |
| Tablet | `640–1024px` | Hero h1 → `text-su-display-lg`; cards 2-up |
| Desktop | `1024–1280px` | Full hero `text-su-display-mega`; cards 3-up |
| Wide | `> 1280px` | Content caps at 1200px, hero full-bleed |

Mobile hero class progression:
```tsx
className="text-su-display-sm sm:text-su-display-lg lg:text-su-display-mega"
```

---

## Do's and Don'ts

### Do
- Use `bg-su-primary` only for primary CTAs and brand accent links.
- Make every button `rounded-su-pill`. Every card `rounded-su-xl`. Every avatar `rounded-su-full`.
- Add `[font-feature-settings:'tnum']` to every Naira amount and percentage.
- Rotate white → gray → dark band rhythm on marketing pages. Never two dark bands in a row.
- Use `text-su-semantic-up` / `text-su-semantic-down` as text color only — never as button or card fills.
- Keep display headlines at `font-normal` (weight 400). Heavier = wrong brand voice.
- End every marketing page with the dark CTA band just before the footer.

### Don't
- Don't use `bg-su-primary` on secondary or ghost buttons.
- Don't use `rounded-none` on any interactive element.
- Don't skip `[font-feature-settings:'tnum']` on financial figures — columns must align.
- Don't put more than one or two `text-su-primary` / `bg-su-primary` moments per page section.
- Don't use `text-su-semantic-up` or `text-su-semantic-down` as backgrounds.
- Don't bold display copy (`font-bold` on `text-su-display-*`). It breaks the editorial voice.
- Don't use `su-accent-yellow` as a CTA or status color — illustrative only.
