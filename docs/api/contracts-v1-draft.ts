/**
 * Explore&Earn — API & DOMAIN CONTRACTS V1 *DRAFT* (REFERENCE ONLY)
 * Lives under docs/ on purpose: it is NOT compiled by app/package builds.
 * When founder-approved, these shapes move into packages/contracts/src/*.
 * Enum tuples mirror the Canonical Enum Registry (DR-B1, G13). Do not invent.
 */

/* ----- envelope (api.ts) -------------------------------------------------- */
export type ApiError = {
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export const API_ERROR_CODES = [
  'UNAUTHENTICATED', 'FORBIDDEN', 'COMPLETION_GATE_NOT_MET',
  'PLAN_ENTITLEMENT_REQUIRED', 'INVITE_CREDITS_REQUIRED',
  'LISTING_CAPACITY_EXCEEDED', 'OBJECT_NOT_ACTIVE', 'OBJECT_EXPIRED',
  'RATE_LIMITED', 'MODERATION_RESTRICTED', 'BILLING_REQUIRED',
  'CONFLICT', 'NOT_FOUND', 'VALIDATION_FAILED',
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export type RequestContext = {
  userId: string | null
  scope: 'seeker' | 'host' | 'admin' | 'anon'
  hostId?: string
  isAgeVerified: boolean
}

/* ----- enums (subset — mirror Enum Registry) ------------------------------ */
export const LISTING_CATEGORY = ['farm','maritime','remote','seasonal','mix'] as const
export const APPLICATION_STATUS = // NOTE: NO 'declined' (registry wins)
  ['submitted','viewed','shortlisted','accepted','active','withdrawn','not_selected','expired'] as const
export const CONVERSATION_CONTEXT = ['invite','application','offer','dispute','support'] as const
export const HOST_ATTESTATION_STATUS = ['not_attested','attested','lapsed','revoked'] as const
export const TEAM_ROLE = ['owner','admin','hiring_manager','analyst','billing','viewer'] as const // DR-B5

/* ----- pricing (cents — ADR-028 founder-locked; DR-B3) -------------------- */
export const FOUNDER_LOCKED_PRICING = {
  monthly: { starter: 19900, pro: 39900, enterprise: 74900 },
  annual:  { starter: 199000, pro: 399000, enterprise: 749000 },
  founding:{ starter: 14900, pro: 29900, enterprise: 59900 }, // verify vs ADR-028 before seed
} as const
export const ADDON_PRICING = {
  boost: { d7: 20000, d14: 35000, d28: 50000 },
  teamSeatMonthly: 4900,
  invitePack: { small: 25000, medium: 50000, large: 75000 }, // non-refundable
} as const

/* ----- entitlement gate (G14) — every mutation calls this ----------------- */
export type EntitlementAction = string // e.g. 'listing.publish', 'invite.send'
export declare function requireEntitlement(
  ctx: RequestContext, action: EntitlementAction,
): ApiResponse<true>

/* ----- matching contract boundary (G8 / DR-B14) --------------------------- */
/** match_score MUST be pure wrt monetization: no pricing/boost/entitlement inputs. */
export type MatchInput = {
  seeker: { desiredCategories: string[]; needsHousing?: boolean; skills: string[]; certs: string[] }
  listing: { category: string; mixDomains?: string[]; housingProvided?: boolean; requiredCerts: string[] }
  // NO plan tier, NO boost, NO entitlement — enforced by lint + unit test.
}
export type MatchResult = { score: number /*0..100*/; confidence: number /*0..100*/ }

/* ----- discovery display score (monetization is HERE, not in match) ------- */
export type DisplayScoreInput = {
  relevance: number; quality: number; freshness: number
  engagement: number; monetization: number; diversity: number // all 0..100
}
// display = relevance*.40 + quality*.15 + freshness*.10 + engagement*.10 + monetization*.15 + diversity*.10
export const DISPLAY_WEIGHTS = {
  relevance: 0.40, quality: 0.15, freshness: 0.10,
  engagement: 0.10, monetization: 0.15, diversity: 0.10,
} as const

/* ----- trust qualifier (G22) ---------------------------------------------- */
export const VERIFIED_HOST_QUALIFIER = 'Self-Declared by Host' as const
