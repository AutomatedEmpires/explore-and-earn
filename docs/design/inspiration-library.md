# Inspiration Library — Explore&Earn

> **Status:** Design-brain. A catalog of **what world-class looks like per surface**, with principles extracted from premium references and translated to Explore&Earn. **Principles only — never copy designs or paste others' code.** Pairs with [`reference-patterns.md`](./reference-patterns.md) (the reusable building blocks that implement these) and is judged by [`page-scorecard.md`](./page-scorecard.md).
>
> References to learn *from* (extract, don't clone): Patagonia / Filson / REI Co-op Journal, Airbnb, National Geographic / field guides, premium travel apps (Hopper-class) for motion. Avoid the three AI defaults (cream+serif+terracotta; near-black+acid; broadsheet hairlines) and alpine-only tunnel vision.

For each category: **Solves · When to use · What makes it premium · Mistakes to avoid · Apply to E&E.**

---

## 1. Premium marketplace cards
- **Solves:** turning a listing into a desirable place, not a row in a list.
- **When:** anywhere a listing appears — feed, rails, map sheet, saved, search.
- **Premium:** large framed photo carries the card; generous padding; one title face (Patrick Hand); trust + price legible at a glance; depth from border + warm surface, not shadow.
- **Mistakes:** text-first cards; tiny thumbnails; "Perks" instead of the triad; inline-style CTAs; equal-weight everything; gray placeholder when no photo.
- **Apply:** this is `DiscoveryCard` (locked skeleton). Frame the photo, lane atmosphere by category, HOUSING/MEALS/PAY chips first-class, sky CTA. No-photo → lane `--gradient-category-*` + silhouette, never gray.

## 2. Outdoor / travel hero sections
- **Solves:** the hero is the thesis — sell the place and the feeling in the first 0.5s.
- **When:** homepage, category landing, listing detail top, dashboard/profile headers.
- **Premium:** full-bleed warm golden-hour photography; bottom-weighted scrim for legibility (`--gradient-hero-scrim`); one display headline + one CTA; editorial caption authority (Nat Geo).
- **Mistakes:** stock-y generic imagery; filter painted on the photo; competing CTAs; centered-everything; text unreadable over the image; CLS from unreserved image.
- **Apply:** framed scenic hero or lane gradient + scrim + Patrick-Hand display headline + single sky CTA. Balance imagery across all five lanes. `next/image`, reserve space.

## 3. Seeker profile / dashboard surfaces
- **Solves:** make the seeker feel *known* and give momentum — "this is mine, here's my next move."
- **When:** `/home`, `/profile`, `/journey`, status surfaces.
- **Premium:** profile-as-journey (been / headed / readiness), not a résumé form; scrim hero + avatar overlap; one dominant next-action; rails of matched/saved/applied with peek affordance.
- **Mistakes:** opening on a stat grid; flat equal cards; a wall of form fields; no clear "what now"; empty rails with no story.
- **Apply:** `SeekerHero` + readiness state (`--state-*`) + intent-grouped modules + `DiscoveryCard` rails. Resume as a guided journey, not a bare multi-field form.

## 4. Host dashboard surfaces
- **Solves:** make the host feel in command of something real and see what needs them.
- **When:** `/host` and sub-surfaces (applicants, listings, analytics, billing).
- **Premium:** opens with a dominant next-action ("3 applicants need you"); listings as visual assets; applicants as people (face + story); one promoted KPI; commercially serious without being a spreadsheet.
- **Mistakes:** "generic admin template" — flat vertical stack of identical cards; dense corporate table as the front door; uniform stat boxes; no hero/next-action; applicants as table rows.
- **Apply:** hero/next-action band → intent groups (needs me / in motion / done) → `ui-stat` with one promoted metric → asset-style listing cards → human applicant review. Analytics tables go mobile-adaptive and never lead.

## 5. Maps & saved locations
- **Solves:** location as a feeling you explore, not a dropdown filter.
- **When:** `/map`, `/saved`, listing detail location, anywhere geography matters.
- **Premium:** custom branded pins; map+list duality (Airbnb); mobile bottom-sheet detail; hover↔pin highlight on desktop; clustering; sense of place.
- **Mistakes:** default Mapbox pins; gray loading box; map that fights the page scroll; no reserved height; pin spam with no clustering.
- **Apply:** Mapbox is wired — ink/paper pins (`--elevation-pin`), lane-tinted; mobile = full map + draggable sheet with the listing's `DiscoveryCard`; desktop = split map+list with linked highlight.

## 6. Mobile navigation
- **Solves:** fast, thumb-friendly movement through a media-rich product.
- **When:** all seeker/host mobile surfaces.
- **Premium:** ≤5 bottom-nav destinations, icon **+** label, clear active state, safe-area aware; bottom action rows on detail; sheets for depth.
- **Mistakes:** icon-only nav; >5 items; sub-44px targets; nav that disappears in sub-flows; hidden primary actions.
- **Apply:** bottom nav `--size-bottom-nav` 64, active = color + weight (not color alone), ≥44px, bottom-sheet escalation for deep content.

## 7. Motion / interaction patterns
- **Solves:** make the product feel alive and physical without being a gimmick.
- **When:** sheets, swipe, status/meter changes, hero/rail reveal, loading, hover/press.
- **Premium:** one orchestrated reveal beats scattered effects; physical slides/settles; shimmer skeletons; symmetric enter/exit; momentum on sheets.
- **Mistakes:** bounce/spring overshoot; decorative loops; animating layout (jank); missing tap/press feedback; reduced-motion ignored; entrance animation on everything.
- **Apply:** the locked motion tokens + [`motion-system.md`](./motion-system.md). Animate transform/opacity only; name every animation's meaning or cut it.

## 8. Trust / safety surfaces
- **Solves:** make the housing/meals/pay promise *believable*.
- **When:** every listing, host profile, application/offer flow.
- **Premium:** trust designed into the core (the triad, verification) not bolted on; honest qualified claims ("Self-Declared by Host"); specific data over adjectives.
- **Mistakes:** "Perks" instead of the triad; trust as a decorative logo wall; implying guarantees not made; color-only verification.
- **Apply:** triad chips first-class everywhere; `VerifiedHostBadge` + qualifier (CI G22); calm plain copy; server-enforced moderation surfaced honestly.

## 9. Pricing / boosted listing surfaces
- **Solves:** sell host upgrades as valuable, not spammy.
- **When:** host billing, boost flows, boosted treatment on cards.
- **Premium:** gold reserved for the special (`--color-gold`, `--status-boosted`); clear value framing; restrained, confident; `FoundingCountdown` scarcity done tastefully.
- **Mistakes:** spammy "BOOST!!!" treatments; gold everywhere (kills its specialness); ad-heavy clutter; dark-pattern urgency.
- **Apply:** boosted = a tasteful gold accent + clear "why it helps," never a flashing banner. Pricing as a calm, premium comparison.

## 10. Community dashboard surfaces
- **Solves:** belonging — "there are people like me doing this."
- **When:** `/community`, announcements, photos.
- **Premium:** frame+mat photo cards (keepsake feel); official posts visually distinct + authoritative; alive feed; easy posting; blog-grade layout.
- **Mistakes:** real announcements as bare text blocks while fixtures get photos (real < fake — a documented defect); broken/unstyled forms (phantom tokens); purchased/promoted status fetched but never shown.
- **Apply:** frame-and-mat photos, lane atmosphere fallback for image-less posts, official badge styling, a working tokenized photo-upload form, surface promoted/`isPurchased` state.

---

**Use this library as a vision check:** before building a surface, find its category here, confirm the premium-makers are present and the mistakes are absent, then reach for the concrete building blocks in [`reference-patterns.md`](./reference-patterns.md).
