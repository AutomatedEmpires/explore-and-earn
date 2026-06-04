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

// Per-tier entitlements (ADR-039). Server-computed from Subscription +
// PlanEntitlement; never frontend-hardcoded (G14). Starter keeps 0 included
// invite credits (ADR-005).
export const PLAN_ENTITLEMENTS = {
  starter: {
    listings: 1,
    includedInviteCredits: 0,
    monthlyAnnouncements: 0,
    teamSeats: 0,
    analytics: "basic",
  },
  professional: {
    listings: 5,
    includedInviteCredits: 5,
    monthlyAnnouncements: 1,
    teamSeats: 0,
    analytics: "full",
  },
  enterprise: {
    listings: 10,
    includedInviteCredits: 10,
    monthlyAnnouncements: 3,
    teamSeats: 1,
    analytics: "full",
  },
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
// Team seat: ADR-032 — Enterprise-only, $49/seat/mo, billed per active quantity
// with proration.
export const ADDON_PRICING = {
  boost: {
    d7: 20000, // $200 / 7 days
    d14: 35000, // $350 / 14 days
    d28: 50000, // $500 / 28 days
  },
  teamSeatMonthly: 4900, // $49/mo
} as const

// Service credits expire 12 months after issuance; redemption is FIFO
// oldest-first, auto-applied to the next invoice, capped at invoice total, no
// cash-out (ADR-033).
export const SERVICE_CREDIT_EXPIRY_MONTHS = 12

// Featured Employer is a SEPARATE add-on, NOT included in any tier. Same price
// point as Boost (ADR-031); the canonical price surface is the Pricing Details
// page — intentionally not duplicated here to avoid drift.
