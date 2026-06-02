# Figma AI — Design Brief & Prompts

> The single brief to hand **Figma AI (Figma Make)** so it designs Explore&Earn from locked canon, not guesswork. Figma can read this repo **and** the Notion canon. Product truth lives in Notion; this file mirrors the brief for repo access. The canonical, link-rich version is the **"Figma AI — Design Brief & Prompts"** page in Notion (under the *Source of Truth — Master Index*).
>
> Run in two phases: **Phase 1 = test (one card)**, then **Phase 2 = full screens**.

## How to use

1. Open **Figma → New → Figma Make**.
2. Give Figma access to this repo and the Notion brief page.
3. Paste the **Phase 1 (Test)** prompt; judge against the acceptance checklist.
4. If it passes, paste the **Phase 2 (Full)** prompt.
5. Screenshot the output and save it back here as visual reference.

## Read these first — Source of Truth

Notion = product truth; GitHub = implementation truth. Do **not** invent visual direction — it is locked.

**This repo:**

- [`./design-system-v1.md`](./design-system-v1.md) — tokens (color/type/spacing/radius/elevation/motion)
- [`./visual-language.md`](./visual-language.md), [`./photo-language.md`](./photo-language.md)
- [`./discovery-card-v1.md`](./discovery-card-v1.md), [`./listing-detail-v1.md`](./listing-detail-v1.md)
- [`./icon-system.md`](./icon-system.md), [`./streamline-freehand-map.md`](./streamline-freehand-map.md), [`./design-drift-prevention.md`](./design-drift-prevention.md)
- [`../product/product-principles.md`](../product/product-principles.md), [`../product/discovery-card-v1.md`](../product/discovery-card-v1.md), [`../product/listing-detail-v1.md`](../product/listing-detail-v1.md)
- [`../../packages/ui/src/icons/registry.ts`](../../packages/ui/src/icons/registry.ts) — concept→icon registry (stable keys like `benefit.housing`)

**Notion canon:** Design Tokens & Visual System — V1 · Canonical Card System Specification · Badge System · Icon & Element System (Locked) · Source of Truth Master Index.

## Non-negotiable constraints

**Feel:** Premium Adventure + Warm Working Landscape + Operational Efficiency. Closer to **Airbnb / Patagonia / National Geographic**; **never** Indeed / ZipRecruiter / generic SaaS / corporate HR. Visual quality is the #1 priority.

**Hard rules:**

- **Triad mandatory:** Housing / Meals / Pay — never "Perks."
- **Verified Host badge mandatory** and reads **"Self-Declared"** (no implied platform verification).
- **One unified component system** across all four lanes — vary imagery + accent, never fork per category.
- **Tokens only** (exact hex below). Borders-first — **no card shadows.** Frame photos, never filter. One hand-drawn line-icon set. Never color-only status. Mobile-first.

**Tokens (use exactly):**

| Group | Value |
| --- | --- |
| Surfaces | page `#F6F3EC` · card `#FBF9F3` · raised `#FFFFFF` |
| Borders | ink `#33312B` (1px) · soft divider `#E7E1D3` |
| Text | primary `#24221E` · secondary `#6E685D` · muted `#9A9486` |
| Housing chip | bg `#DCEBD6` · text `#41663A` |
| Meals chip | bg `#F3DFD3` · text `#9A5B3C` |
| Pay chip | bg `#DAE4F0` · text `#3F5687` |
| Verified Host | bg `#DBEAE2` · text `#2E6B57` |
| Category Farm | bg `#EDE3CF` · text `#6B5326` |
| Category Seasonal/Lodge | bg `#DCEBD6` · text `#41663A` |
| Category Maritime | bg `#D6E6E9` · text `#2E5E6B` |
| Category Remote | bg `#DEE0F2` · text `#3F4A87` |
| Radius | card 24 · image 16 · chips/badges full pill |
| Type | titles: hand-drawn display (Patrick Hand) · UI/body: Inter |
| Photo | 3:2, cover, framed (never filtered) |

## Phase 1 — TEST PROMPT (run first, one card)

```
You are designing for Explore&Earn, a premium lifestyle-work marketplace. First read the canon: the Notion "Figma AI — Design Brief" page and this GitHub repo (docs/design/* and docs/product/*). Do NOT invent visual direction — it is locked.

Build a SINGLE mobile UI card called "Discovery Card" (mobile width 390px), one card on a paper-colored canvas. Reference: Airbnb x Patagonia x National Geographic. NOT Indeed, NOT a generic SaaS dashboard.

AESTHETIC: hybrid sketchbook + product UI. Warm, premium, organic "Warm Working Landscape." Soft hand-drawn card edges, paper-like surfaces, calm, high-trust, fast to scan, zero clutter.

TOKENS (exact): page bg #F6F3EC; card #FBF9F3; raised #FFFFFF; ink border #33312B 1px; soft divider #E7E1D3; text primary #24221E, secondary #6E685D, muted #9A9486. Card radius 24, image radius 16, chips/badges full pill. ELEVATION: borders-first — NO drop shadows. Titles in a hand-drawn display font (Patrick Hand); UI/body in Inter.

CARD STRUCTURE (top to bottom):
1. Hero photo 3:2, a warm golden-hour FARM/ORCHARD working landscape (barn, produce, wood, baskets), inside a thin hand-drawn ink frame with a small paper mat — frame AROUND the photo, never a filter ON it.
2. Badge row over the photo: "Verified Host" pill (bg #DBEAE2, text #2E6B57, small check) that MUST read "Verified Host · Self-Declared"; plus category pill "Farm" (bg #EDE3CF, text #6B5326).
3. Host row: circular avatar + host name (Inter 600) + job title (Inter, secondary).
4. Meta row: location with map-pin icon + "Begins" / "Ends" dates.
5. THE TRIAD — three equal benefit chips (icon + label + value), never "Perks":
   HOUSING (bg #DCEBD6, text #41663A) "Private cabin"; MEALS (bg #F3DFD3, text #9A5B3C) "3 meals/day"; PAY (bg #DAE4F0, text #3F5687) "$1,200/mo".
6. Primary action "Quick Apply" (pill, ink border, paper fill, Inter 600).

RULES: one consistent hand-drawn line-icon set (no mixed libraries); never use color alone to signal anything (icon + label); mobile, large tap targets, generous whitespace.
```

## Acceptance check

- [ ] Feels premium / adventure / warm — NOT a generic SaaS card (make-or-break)
- [ ] Triad present as 3 distinct chips (Housing/Meals/Pay), correct colors, not "Perks"
- [ ] Verified Host pill present and reads "Self-Declared"
- [ ] Paper surface, hand-drawn ink frame around the photo, no drop shadow, soft ~24px radius
- [ ] Hand-drawn display font on the title, Inter elsewhere

## Phase 2 — FULL PROMPT (run after the test passes)

```
Using the SAME design system, tokens, and aesthetic as the Discovery Card test (and the canon in the Notion brief + this GitHub repo), build TWO connected mobile screens (390px). Keep: paper surfaces, ink borders, borders-first (no shadows), hand-drawn display font for titles + Inter for UI, pill chips, 3:2 framed photos (frame around, never filter), the mandatory triad (Housing/Meals/Pay), and a "Verified Host · Self-Declared" badge on every card.

SCREEN 1 — DISCOVERY FEED (mobile):
- Paper header: product name in the hand-drawn display font + search field + a row of category filter pills (Farm, Lodge/Outdoor, Maritime, Remote).
- Vertical scroll of 4 Discovery Cards sampling lanes (Farm, Maritime, Remote, Seasonal); Mix is blended and demoed separately so the system still reads as ONE unified component across worlds (same card, different imagery + accent — do NOT fork the UI per category):
   1. FARM/ORCHARD — golden-hour, barn, produce. Category pill bg #EDE3CF / text #6B5326.
   2. SEASONAL LODGE/OUTDOOR — mountains, cabin, pine, trail. Pill bg #DCEBD6 / text #41663A.
   3. MARITIME — docks, rope, boats, blue-gray. Pill bg #D6E6E9 / text #2E5E6B.
   4. REMOTE — quiet cabin, laptop, desk. Pill bg #DEE0F2 / text #3F4A87.
- One card shows a subtle "Featured" pill; one shows a subtle "Match" indicator — tasteful, never spammy/ad-like.
- Bottom: a 64px mobile nav bar with 4–5 hand-drawn icons (Discover, Map, Saved, Messages, Profile).

SCREEN 2 — LISTING DETAIL (mobile), opened from a card:
- Hero photo gallery (3:2, framed, swipeable) with Verified Host + category badges overlaid.
- Title block: job title (display font), host avatar + name, location with map-pin, begins/ends dates.
- TRIAD summary as three prominent expandable blocks: Housing, Meals, Pay (same colors), each with a short value + a "see photos" affordance.
- "About the role" (description, schedule, requirements) + a short "About the host" block with a trust note.
- A small map preview for location.
- A STICKY bottom bar: "Quick Apply" primary button + Save (heart) + Share.

GLOBAL RULES: one consistent hand-drawn line-icon set across both screens; tokens only (exact hex above); never signal status by color alone; mobile-first, large tap targets, generous whitespace; warm organic photography across all five lanes (do not let it become only alpine — farm/greenhouse/maritime/remote/seasonal must all read distinctly, and Mix must read intentionally blended).
```

## Hard rules / anti-patterns (paste if Figma drifts)

- Drop shadows on cards → hand-drawn ink borders
- Filters/overlays on photos → frame + paper mat around untouched photos
- "Perks" / merged benefits → Housing / Meals / Pay as three first-class chips
- Mixed icon libraries → one hand-drawn Streamline-style line set
- Color-only status → icon + label always
- Separate UI per category → one component, varied imagery + accent
- Corporate/stock office look → warm, organic, real working landscapes

## Bring it back

Screenshot Figma's output and save it next to `discovery-card-v1.md` and `listing-detail-v1.md`, then link it from the Notion brief so canon and visuals stay in sync.
