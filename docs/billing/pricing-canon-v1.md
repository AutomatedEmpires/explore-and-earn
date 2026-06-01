# Pricing Canon V1 (mirror of Notion canon)

> **DRAFT.** Authoritative amounts live in Notion **Founder Locked Pricing (ADR-028)** and **Pricing Details & Add-Ons**, and in code at `packages/contracts/src/pricing.ts`. This doc mirrors them for reviewers. If any value here disagrees with ADR/Founder Locked canon, **canon wins** and this doc is wrong and must be corrected.

## Principle

Seekers never pay. Hosts pay. Monetization must not bury core value (housing, meals, pay, trust, fast decisions) and must never falsify match quality (G8).

## Host plans (ADR-028, Founder Locked)

| Plan key | Display | Monthly | Annual | Listings | Analytics | Announcements | Team seats | Invite credits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan_starter` | Starter | $199/mo | $1,990/yr | 1 | basic | 0 | 0 | 0 | locked |
| `plan_professional` | Professional | $399/mo | $3,990/yr | 5 | full | 1/mo | 0 | 5 | locked |
| `plan_enterprise` | Enterprise | $749/mo | $7,490/yr | 10 | full + advanced | 3/mo | 1 | 10 | locked |

- Annual = 10× monthly (“two months free”). **Do not** use percentage-discount language.
- **Superseded (do not use as host pricing):** legacy $250 / $500 / $750 monthly and $2,500 / $5,000 / $7,500 annual.

## Founding Host Program (ADR-030 / ADR-034 / ADR-035)

Implemented as **6 forever, fixed-amount coupons** (not separate plans):

| Coupon key | Applies to | Discount | Effective monthly | Effective annual |
| --- | --- | --- | --- | --- |
| `coupon_founding_starter_{monthly,annual}` | Starter | −$50 | $149 | $1,490 |
| `coupon_founding_professional_{monthly,annual}` | Professional | −$100 | $299 | $2,990 |
| `coupon_founding_enterprise_{monthly,annual}` | Enterprise | −$150 | $599 | $5,990 |

- Hard cap **100 paid founding subscriptions total**, enforced **server-side** (Stripe `max_redemptions` 200 is only a safety ceiling, not the limit). (G24)
- Cancel forfeits the founding rate; the seat is **never** freed.
- Tier change swaps to the equivalent founding coupon without consuming a new seat (ADR-034).
- Cap-race losers **downgrade to standard pricing, never cancel** (ADR-035), with a +24h refund-eligibility flag.

## Add-ons (Pricing Details & Add-Ons)

| Add-on key | Amount | Billing | Refundable | Notes / ADR |
| --- | --- | --- | --- | --- |
| `addon_additional_listing` | $100/mo | recurring, qty | yes (via RefundReview) | per extra listing |
| `addon_boost_7d` / `_14d` / `_28d` | $200 / $350 / $500 | one-time | per refund policy | exposure-only, surface=listing (ADR-031, G8) |
| `addon_featured_employer_7d` / `_14d` / `_28d` | $200 / $350 / $500 | one-time | per refund policy | surface=host, never bundled (G21) |
| `addon_community_announcement` | $150 | one-time | per refund policy | active_days=15; Pro 1/mo & Ent 3/mo included |
| `addon_invite_pack_5` / `_10` / `_25` | $250 / $400 / $750 | one-time | **NO** | see `invite-packs-v1.md` |
| `addon_team_seat` | $49/seat/mo | recurring | prorated | Enterprise-only (ADR-032) |

## Resolved: pricing unit normalization (Q-BILL-1)

**Resolved 2026-05-31 (founder-approved, Gate P-UNIT).** `packages/contracts/src/pricing.ts` now stores all amounts in **integer USD cents** (e.g. Starter monthly `19900`), matching guardrails **G1 / G23**, and `check-pricing-units.mjs` is **green**. The dollar figures in the tables above are display values for reviewers; the cent values in `pricing.ts` and the Notion canon are authoritative. Any future change to plan names, amounts, intervals, add-on pricing, or the founding program is still founder-gated — do not change silently.

## Founder gate

Any change to plan names, amounts, intervals, add-on pricing, or the founding program requires founder approval (see `billing-approval-gates.md`).
