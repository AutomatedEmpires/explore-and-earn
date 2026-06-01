/**
 * Refund-review contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Source of truth: Refund Policy + Missing Entity Specs / RefundReview (ADR-015,
 * ADR-033). RULES: no SDK, no live calls, no secrets, no logic. Only the
 * refund-review service may ever call stripe.refunds.create (G5).
 */

import type { PurchaseObjectType } from "./billing"

export const REFUND_REVIEW_STATUSES = [
	"opened",
	"under_review",
	"approved",
	"denied",
	"processed",
	"service_credit_issued",
	"failed",
	"cancelled",
] as const
export type RefundReviewStatus = (typeof REFUND_REVIEW_STATUSES)[number]

export const REFUND_OUTCOME_TYPES = [
	"stripe_refund",
	"service_credit",
	"denied",
	"cancelled",
] as const
export type RefundOutcomeType = (typeof REFUND_OUTCOME_TYPES)[number]

export const REFUND_REASON_CODES = [
	"duplicate_charge",
	"billing_error",
	"unused_service",
	"platform_error",
	"moderation_action",
	"goodwill",
	"fraud_denied",
	"other",
] as const
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number]

/** Object types that are NON-refundable. Reviews on these must be auto-rejected (403 non_refundable_product). */
export const NON_REFUNDABLE_OBJECT_TYPES = [
	"invite_credit",
] as const
export type NonRefundableObjectType =
	(typeof NON_REFUNDABLE_OBJECT_TYPES)[number]

export interface RefundReview {
	id: string
	billingAccountId: string
	relatedObjectType: PurchaseObjectType | "invite_credit_purchase"
	relatedObjectId: string | null
	stripeChargeId: string | null
	stripeRefundId: string | null
	status: RefundReviewStatus
	reasonCode: RefundReasonCode
	outcomeType: RefundOutcomeType | null
	requestedBy: string
	reviewedBy: string | null
	evidence: string | null
	createdAt: string
	updatedAt: string
}

/** FIFO service-credit ledger entry (ADR-033). 12-month expiry; no cash-out. */
export interface ServiceCreditLedgerEntry {
	id: string
	billingAccountId: string
	refundReviewId: string | null
	amountCents: number
	remainingCents: number
	appliedToInvoiceId: string | null
	expiresAt: string
	createdAt: string
}
