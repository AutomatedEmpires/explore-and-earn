# Boosts & Featured Visibility V1

> **DRAFT.** Visibility products increase **exposure only**. They must never falsify match quality, ranking relevance, or trust signals (G8). Boosts and featured-employer are distinct and are **never bundled** (G21).

## Products

### Listing Boost (ADR-031, exposure-only)

| Product key | Duration | Price | Surface |
| --- | --- | --- | --- |
| `addon_boost_7d` | 7 days | $200 | listing |
| `addon_boost_14d` | 14 days | $350 | listing |
| `addon_boost_28d` | 28 days | $500 | listing |

- **What it does:** increases listing exposure on permitted surfaces (`BoostPlacementSurface`: seek, swipe, map_drawer, map_pin, community_feed, homepage).
- **What it must NOT do:** alter `match_score`, reorder by relevance, or hide that a listing is promoted. Promoted placements must be visibly labeled.

### Featured Employer

| Product key | Duration | Price | Surface |
| --- | --- | --- | --- |
| `addon_featured_employer_7d` | 7 days | $200 | host |
| `addon_featured_employer_14d` | 14 days | $350 | host |
| `addon_featured_employer_28d` | 28 days | $500 | host |

- **Surface:** host-level (`FeaturedEmployerSurface`: homepage, seek_dashboard, category_dashboard).
- **Never** granted as a default plan entitlement (G21).

## V1 inclusion decision

| Surface | V1? |
| --- | --- |
| boosted listing | yes (modeled, gated) |
| featured employer | yes (modeled, gated) |
| homepage placement | yes (as boost/featured surface) |
| category placement | yes (featured surface) |
| map pin prominence | yes (boost surface) |
| search ranking visibility | exposure-only; **must not** change relevance scoring (G8) |
| matched-candidate visibility | **deferred** `TODO(?)` confirm canon |

## Ethics / trust constraints

- Monetization must not bury core value (housing, meals, pay, trust, fast decisions).
- `services/matching` may **not** import pricing/entitlements/boost/featured modules (G8 boundary).
- All promoted surfaces carry a visible promoted label.

## Analytics events

`boost_purchased`, `boost_started`, `boost_ended`, `featured_purchased`, `featured_started`, `featured_ended`. See `billing-event-taxonomy-v1.md`.

## Founder gate

Boost/featured pricing, durations, surfaces, and visibility rules are founder-locked.
