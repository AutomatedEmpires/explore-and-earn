// Founder Locked Pricing — Canonical Host Plans (contract mirror)
// MIRROR of the Notion "Founder Locked Pricing" page (the pricing authority; it
// wins over any other page). Agents must not alter these values without explicit
// founder instruction.
//
// MONEY IS INTEGER CENTS EVERYWHERE (DR-B3 / G1 / G23). NOTE: the prior stub
// stored DOLLARS (e.g. 199); that violated the cents guardrail and is corrected
// here. Annual = exactly 10 monthly payments (surface as "2 months free"; never
// percentage-discount language).

export const ANNUAL_MONTHS_BILLED = 10

// Subscription prices in integer cents.
export const FOUNDER_LOCKED_PRICING = {
  starter: {
    monthly: 19900, // $199
    yearly: 199000, // $1,990 = 10 months
  },
  professional: {
    monthly: 39900, // $399
    yearly: 399000, // $3,990 = 10 months
  },
  enterprise: {
    monthly: 74900, // $749
    yearly: 749000, // $7,490 = 10 months
  },
} as const

// Core entitlement direction per tier (Founder Locked Pricing page).
export const PLAN_ENTITLEMENTS = {
  starter: {
    listings: 1,
    includedInviteCredits: 0,
    communityAnnouncements: 0,
    teamSeats: 0,
    analytics: "basic",
  },
  professional: {
    listings: 5,
    includedInviteCredits: 5,
    communityAnnouncements: 1,
    teamSeats: 0,
    analytics: "full",
  },
  enterprise: {
    listings: 10,
    includedInviteCredits: 10,
    communityAnnouncements: 3,
    teamSeats: 1,
    analytics: "full",
  },
} as const

// Invite credit packs (integer cents). Per Founder Locked Pricing: 5=$250,
// 10=$400, 25=$750. Invite credits are NON-REFUNDABLE — RefundReview must deny
// refunds whose related object is an invite-credit purchase.
export const INVITE_CREDIT_PACKS = [
  { credits: 5, priceCents: 25000 },
  { credits: 10, priceCents: 40000 },
  { credits: 25, priceCents: 75000 },
] as const
export const INVITE_CREDITS_REFUNDABLE = false

// Add-on pricing (integer cents). SOURCE: Backend Build Pack §4 — NOT yet on the
// Founder-Locked Pricing page. Treat as provisional pending founder lock; do not
// surface as canonical until ratified.
export const ADDON_PRICING = {
  boost: {
    d7: 20000, // $200
    d14: 35000, // $350
    d28: 50000, // $500
  },
  teamSeatMonthly: 4900, // $49/mo
} as const

// Featured Employer is a SEPARATE add-on, NOT included in any tier. Pricing is
// defined on the dedicated Pricing Details page — intentionally not duplicated
// here to avoid drift.
