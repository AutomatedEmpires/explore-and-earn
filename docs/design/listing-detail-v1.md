# Listing Detail V1 — Design Spec

> The full view opened when a Discovery Card body is tapped. Product-level rules: [`../product/listing-detail-v1.md`](../product/listing-detail-v1.md). Reuses the same tokens, photo language, icon registry, and triad as the card.

## Purpose

The Listing Detail is where a seeker decides to apply. It expands the card's compressed information into a scannable, trust-forward page — same visual language, more depth.

## Section order (mobile-first, top to bottom)

1. **Hero media** — framed scenic photo(s); horizontally swipeable gallery; `3:2`. Badge stack overlaid (Verified Host mandatory, category, seasonal/featured, boosted/match if relevant).
2. **Title block** — job title (Manrope bold), host name + avatar (tap → host profile), location (tap → map), begins/ends dates.
3. **Triad summary** — HOUSING / MEALS / PAY as three prominent blocks; each expandable:
   - **Housing** → housing details + photo bucket.
   - **Meals** → meals details + photo bucket.
   - **Pay** → pay summary + structure.
4. **About the role** — description, responsibilities, schedule, requirements.
5. **About the host** — short host blurb, trust signals, link to full host profile.
6. **Location** — map preview (tap → full map), region/area context (respect any location-privacy rules from canon).
7. **Trust & verification** — Verified Host (self-declared) explainer; housing/meals evidence photos.
8. **Apply** — persistent/sticky **Quick Apply** action (mobile: sticky bottom bar; desktop: side rail).

## Interactions

- Sticky Quick Apply on mobile (bottom bar); side-rail apply on desktop.
- Housing/Meals blocks expand to detail + photo bucket.
- Host avatar/name → host profile. Location → map. Save + Share + Report available.
- Photo gallery: swipe (mobile) / arrows (desktop); framed, never filtered.

## Visual direction

Same as the card: paper surface, ink borders, framed warm photography, hand-drawn icons, clean information blocks, generous whitespace, fast scanning. Borders-first; overlays (sheets/modals) use `--elevation-overlay`.

## Responsive

- **Mobile:** single column, sticky apply bar, bottom-sheet escalation for housing/meals detail.
- **Desktop (≥ 1024):** two-column — media + content left, sticky apply/host rail right.

## States

loading (skeleton) · default · saved · applied · closed/filled (apply disabled with reason) · boosted · matched · under-review (admin) · error/empty.

## Accessibility

Logical heading order, visible focus, non-color-only status, readable targets, reduced-motion gallery.

## Implementation target

`apps/web` route composing `packages/ui` primitives; reuses `MediaFrame`, `BadgeStack`, `BenefitChip`, `Avatar`, `ActionRow` from the Discovery Card. No new icon set; no new tokens.
