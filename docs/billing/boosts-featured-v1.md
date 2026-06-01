# Boosts & Featured Visibility V1

> **DRAFT.** Visibility products increase **exposure only** — never match quality, ranking relevance, or trust signals (G8). Listing **Boost** and **Featured Employer** are distinct products and are **never bundled** (G21).

## Locked decisions reflected

- Boosted listings are **interwoven into discovery** (not a segregated ad rail).
- Featured employers are **host-level rails** that link to host profile pages.
- Housing/meals trust media remain clickable from listing cards regardless of boost.

## Products

### Listing Boost (ADR-031, exposure-only)

| Product key | Duration | Price | Surface | Entitlement |
| --- | --- | --- | --- | --- |
| `addon_boost_7d` | 7 days | $200 | listing | `listing.boost` |
| `addon_boost_14d` | 14 days | $350 | listing | `listing.boost` |
| `addon_boost_28d` | 28 days | $500 | listing | `listing.boost` |

Boost amounts are stored in **integer cents** in canon (G23: 20000 / 35000 / 50000) — see Q-BILL-1.

### Featured Employer

| Product key | Duration | Price | Surface | Entitlement |
| --- | --- | --- | --- | --- |
| `addon_featured_employer_7d` | 7 days | $200 | host | `host.featured` |
| `addon_featured_employer_14d` | 14 days | $350 | host | `host.featured` |
| `addon_featured_employer_28d` | 28 days | $500 | host | `host.featured` |

Featured employer is **never** a default plan entitlement (G21).

## Placement surfaces

- Boost (`BoostPlacementSurface`): `seek`, `swipe`, `map_drawer`, `map_pin`, `community_feed`, `homepage`.
- Featured (`FeaturedEmployerSurface`): `homepage`, `seek_dashboard`, `category_dashboard`.

## Exposure caps (Open Question — directional, NOT yet locked)

From the Open Questions & Decision Log (directional only — `TODO(?)` until founder-locked, gate **P-BOOST**):

- Boosted exposure target: ~**15–25%** of viewed listings per session / per dashboard.
- Featured employers: balance across ~**24** active featured employers per scoped dashboard.

Implement caps as **server-side config**, never hardcoded constants; never let boost exceed the cap even if inventory allows.

## Display treatment & labeling

- Every promoted placement carries a visible **Promoted** / **Featured** label.
- Boosted listings must not visually masquerade as an organic top match.
- Promoted ≠ Verified Host. Never imply trust/verification through boost (the Verified Host subtitle is a separate, earned signal — G22).

## Ethics / trust matrix

| Behavior | Allowed | Forbidden |
| --- | --- | --- |
| Increase impressions / position weighting | ✅ | |
| Alter `match_score` or relevance ordering | | ❌ (G8) |
| Hide the promoted label | | ❌ |
| Imply guaranteed hire / match quality | | ❌ |
| Suppress competing organic listings | | ❌ |
| Pay-to-mislead seekers about housing/meals/pay | | ❌ |

## Boundary & safety rules

- `services/matching` may **not** import pricing / entitlements / boost / featured modules (G8).
- Boost/featured live behind **default-off** flags (G20).
- Campaign lifecycle uses `CampaignStatus` + `CampaignDeliveryStatus` (exact enum values pending Q-BILL-2).

## Analytics events & properties

| Event | Properties |
| --- | --- |
| `boost_purchased` | `boost_key`, `surface=listing`, `duration_days` |
| `boost_started` / `boost_ended` | `campaign_id` |
| `featured_purchased` | `featured_key`, `surface=host`, `duration_days` |
| `featured_started` / `featured_ended` | `campaign_id` |

Typed in `packages/contracts/src/billing-events.ts`; see `billing-event-taxonomy-v1.md`.

## Founder gate

Pricing, durations, surfaces, exposure caps, and labeling rules are founder-locked (P-PRICE + P-BOOST).
