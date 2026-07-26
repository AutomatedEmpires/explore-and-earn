// Founder Locked Pricing — Canonical Host Plans (contract mirror)
// MIRROR of the Notion "Founder Locked Pricing" page + Architecture Decision Log
// (ADR-028 / 030 / 031 / 032 / 033 / 039). The pricing page + ADR log win over
// any other source. Agents must not alter these without explicit founder action.
//
// MONEY IS INTEGER CENTS EVERYWHERE (DR-B3 / G1 / G23). NOTE: the prior stub
// stored DOLLARS; that violated the cents guardrail and is corrected here.
// Annual = exactly 10 monthly payments (surface as "2 months free"; never
// percentage-discount language).

export const ANNUAL_MONTHS_BILLED = 10

// Standard host subscription prices in integer cents (ADR-028).
export const FOUNDER_LOCKED_PRICING = {
  starter: { monthly: 19900, yearly: 199000 }, // $199 / $1,990
  professional: { monthly: 39900, yearly: 399000 }, // $399 / $3,990
  enterprise: { monthly: 74900, yearly: 749000 }, // $749 / $7,490
} as const

// Founding Host Program (ADR-030 / 034 / 035 / 036): lifetime-locked discount,
// hard cap of 100 paid seats across all tiers. Host/seat-scoped (survives tier
// changes), forfeited permanently on cancellation. Integer cents.
export const FOUNDING_LOCKED_PRICING = {
  starter: { monthly: 14900, yearly: 149000 }, // $149 / $1,490
  professional: { monthly: 29900, yearly: 299000 }, // $299 / $2,990
  enterprise: { monthly: 59900, yearly: 599000 }, // $599 / $5,990
} as const
export const FOUNDING_SEAT_CAP = 100

// Team seats INCLUDED per tier — founder decision 2026-07-26: "team seats and
// basic/ full analytics are included per tier. not additional products."
//
// EVERY TIER IS ZERO, and that is not a placeholder for a number nobody has
// given — it is the only honest figure while accepting an invitation grants no
// access. The invite / accept / revoke plumbing exists (migration 085,
// queries/hostTeam.ts) but the ACCESS half does not: no policy on listings,
// applications, conversations, messages or any analytics source admits a
// team_memberships row, current_host_profile_ids() is keyed on
// host_profiles.clerk_user_id alone, and nothing anywhere reads role_preset or
// custom_permissions. A person who accepts an invitation today can sign in and
// see exactly what a stranger sees.
//
// So the seat count stays at 0 until a policy admits a member to something. The
// founder's decision is recorded and unimplemented, NOT contradicted: raising
// any of these numbers is the last step of building team access, never the
// first. packages/db/tests/teamSeatCapability.test.ts fails if a number here
// goes above zero while no migration grants a team member access to anything.
//
// A seat is a colleague IN ADDITION to the account owner. The owner holds no
// team_memberships row and is never counted against this number.
//
// 'none' is present so the server can resolve a limit for a host with no active
// subscription without a separate lookup (mirrors MONTHLY_INVITE_QUOTA's shape).
export const TEAM_SEATS_BY_TIER = {
  none: 0,
  starter: 0,
  professional: 0,
  enterprise: 0,
} as const

// Analytics depth per STORED tier. PLAN_ENTITLEMENTS carries the same fact for
// the three paid tiers; this mirror adds the 'none' key the server needs to
// resolve a scope for a host with no subscription, exactly as
// MONTHLY_INVITE_QUOTA does for invites. The analyticsEntitlementConsistency
// test keeps the two from drifting.
//
// WHAT THE TWO SCOPES MEAN (the definition every surface must honour):
//   basic — account-wide aggregates only: applications by pipeline stage,
//           active/total listing counts, invite acceptance rate.
//   full  — everything in basic PLUS the per-listing breakdown: applications by
//           status, invites sent and invites accepted, for each listing.
export const ANALYTICS_ENTITLEMENT = {
  none: "basic",
  starter: "basic",
  professional: "full",
  enterprise: "full",
} as const

export type AnalyticsScope =
  (typeof ANALYTICS_ENTITLEMENT)[keyof typeof ANALYTICS_ENTITLEMENT]

// Per-tier entitlements (ADR-039). Server-computed from Subscription +
// PlanEntitlement; never frontend-hardcoded (G14).
//
// includedInviteCredits are MONTHLY invite allowances (starter 3 /
// professional 10 / enterprise 20) per the founder charter of 2026-07-14
// (product directives v3), superseding ADR-005's one-time starter-0 figure.
// The server-enforced gate is MONTHLY_INVITE_QUOTA below; the
// inviteQuotaConsistency test keeps the two from drifting (a drift would sell
// one allowance and enforce another — the exact failure ADR-039 forbids).
export const PLAN_ENTITLEMENTS = {
  starter: {
    listings: 1,
    includedInviteCredits: 3,
    monthlyAnnouncements: 0,
    teamSeats: TEAM_SEATS_BY_TIER.starter,
    analytics: ANALYTICS_ENTITLEMENT.starter,
  },
  professional: {
    listings: 5,
    includedInviteCredits: 10,
    monthlyAnnouncements: 1,
    teamSeats: TEAM_SEATS_BY_TIER.professional,
    analytics: ANALYTICS_ENTITLEMENT.professional,
  },
  enterprise: {
    listings: 10,
    includedInviteCredits: 20,
    monthlyAnnouncements: 3,
    // 0, not 1. This was Enterprise's headline differentiator at $749/mo and
    // nothing implements it. Invite / accept / revoke were built (migration 085)
    // but ACCEPTING GRANTS NOTHING: no policy admits a team member to a
    // listing, an applicant, a conversation or an analytics figure. An
    // entitlement that renders as a sold feature must be backed by a capability,
    // so this stays at zero until one exists — see TEAM_SEATS_BY_TIER.
    teamSeats: TEAM_SEATS_BY_TIER.enterprise,
    analytics: ANALYTICS_ENTITLEMENT.enterprise,
  },
} as const

// The server-enforced monthly invite allowance per stored tier (mirrors
// ANNOUNCEMENT_MONTHLY_QUOTA's shape). Unsubscribed hosts ('none') get zero
// included invites — sourcing/inviting is a paid capability with an honest
// upsell, not a floored freebie. Purchased packs (INVITE_CREDIT_PACKS) extend
// beyond the monthly allowance and never expire monthly.
export const MONTHLY_INVITE_QUOTA = {
  none: 0,
  starter: 3,
  professional: 10,
  enterprise: 20,
} as const

// Invite credit packs (integer cents) — ADR-028: 5=$250, 10=$400, 25=$750.
// Invite credits are NON-REFUNDABLE; RefundReview must reject refunds whose
// related object is an invite-credit purchase.
export const INVITE_CREDIT_PACKS = [
  { credits: 5, priceCents: 25000 },
  { credits: 10, priceCents: 40000 },
  { credits: 25, priceCents: 75000 },
] as const
export const INVITE_CREDITS_REFUNDABLE = false

// Add-on pricing (integer cents), LOCKED.
// Boost: ADR-031 (founder override 2026-05-31) — priced at the same point as
// Featured Employer; exposure-only, never affects match score (G8).
// Team seat: ADR-032 — $49/seat/mo. NOT surfaced as a self-serve add-on
// (founder directive 2026-06-21: "i dont need team seat addons", reaffirmed
// 2026-07-26: seats are "included per tier. not additional products"); retained
// here as the locked rate only. The number of seats a plan INCLUDES is
// TEAM_SEATS_BY_TIER above — nothing charges this rate.
// Additional active listing: founder directive 2026-06-21 — tiered per plan so
// higher tiers get a cheaper marginal listing. Monthly, per extra active listing
// beyond the plan's included count.
// Additional community announcement: founder directive 2026-06-21 — flat $149 for
// a single 7-day run, no duration options.
export const ADDON_PRICING = {
  boost: {
    d7: 20000, // $200 / 7 days
    d14: 35000, // $350 / 14 days
    d28: 50000, // $500 / 28 days
  },
  teamSeatMonthly: 4900, // $49/mo (locked rate; not self-serve)
  additionalListingMonthly: {
    starter: 9900, // $99/mo per extra active listing
    professional: 7500, // $75/mo per extra active listing
    enterprise: 4900, // $49/mo per extra active listing
  },
  additionalAnnouncement: {
    priceCents: 14900, // $149 flat
    runDays: 7, // single 7-day run, no options
  },
} as const

// Listing boost — typed duration tiers for the self-serve purchase flow.
// DERIVED from ADDON_PRICING.boost above so there is a single source of truth;
// these are the LAUNCH boost pricing tiers (founder-locked, ADR-031). Durations
// mirror the announcement set (7 / 14 / 28) and the listing_boost_campaigns
// table's window semantics. Money is integer cents (G1/G23).
export const BOOST_DURATIONS = [7, 14, 28] as const
export type BoostDuration = (typeof BOOST_DURATIONS)[number]

export const BOOST_PRICING: Record<BoostDuration, number> = {
  7: ADDON_PRICING.boost.d7, // $200
  14: ADDON_PRICING.boost.d14, // $350
  28: ADDON_PRICING.boost.d28, // $500
}

// Additional active listing — the self-serve add-on surface. DERIVED from
// ADDON_PRICING.additionalListingMonthly so there is a single source of truth
// for the three tier prices (founder directive 2026-06-21). Integer cents;
// recurring monthly.
//
// KEYED BY PAID TIER ONLY, deliberately. The add-on is "one more active listing
// beyond your plan's included count", which presupposes a plan. A 'none' key set
// to the Starter rate — alongside a listing cap that floored 'none' at the
// Starter entitlement — meant an unsubscribed host got Starter's included
// listing for nothing and every further listing for the add-on rate, i.e. the
// Starter allowance without the Starter subscription. The founder ruled there is
// no free tier, so: includedListingCapFor('none') is 0
// (packages/db/src/lib/listingAllowance.ts) and this map has no 'none' entry, so
// there is no rate at which an unsubscribed host can be quoted.
export const ADDITIONAL_LISTING_PRICING = {
  starter: ADDON_PRICING.additionalListingMonthly.starter,
  professional: ADDON_PRICING.additionalListingMonthly.professional,
  enterprise: ADDON_PRICING.additionalListingMonthly.enterprise,
} as const

// Upper bound on how many extra listing slots a SINGLE checkout may buy.
//
// ⚠ AWAITS FOUNDER CONFIRMATION. This is not a founder-given number and it is
// not a price. It exists only so a crafted request cannot mint an unbounded
// allowance in one call; a host who needs more buys again. Raise or remove it
// on founder instruction.
export const ADDITIONAL_LISTING_MAX_PER_CHECKOUT = 10

// Service credits expire 12 months after issuance; redemption is FIFO
// oldest-first, auto-applied to the next invoice, capped at invoice total, no
// cash-out (ADR-033).
export const SERVICE_CREDIT_EXPIRY_MONTHS = 12

// Featured Employer is a SEPARATE add-on, NOT included in any tier. Same price
// point as Boost (ADR-031); the canonical price surface is the Pricing Details
// page — intentionally not duplicated here to avoid drift.
