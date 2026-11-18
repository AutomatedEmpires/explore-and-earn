// Operator billing contracts. W3 replaces these stubs.
import type { Db, DbOrTx } from '@/lib/db';
import type { BillingGateway } from './gateway';
import type { SubscriptionState } from './state';

function later(name: string): never {
  throw new Error(`not implemented: ${name} (W3)`);
}

export type OrgBillingSummary = {
  orgId: string;
  state: SubscriptionState;
  stripeCustomerId: string | null;
  founding: 'none' | 'active' | 'lapsed' | 'forfeited';
  hostSince: Date | null;
  operatorTrialDays: number;
  freeUntil: Date | null;
};

export type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  amountPaidCents: number;
  amountRefundedCents: number;
  createdAt: Date;
  hostedInvoiceUrl: string | null;
};

export type CouponRow = {
  promotionCodeId: string;
  code: string;
  couponId: string;
  percentOff: number | null;
  amountOffCents: number | null;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths: number | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
  active: boolean;
};

export type RevenueMetrics = {
  mrrCents: number;
  activeSubscriptions: number;
  cancellations: number;
  failedPayments: number;
};

export async function getOrgBillingSummary(_db: DbOrTx, _orgId: string): Promise<OrgBillingSummary> {
  return later('getOrgBillingSummary');
}
export async function listInvoices(
  _db: DbOrTx,
  _orgId: string,
  _gw?: BillingGateway,
): Promise<InvoiceRow[]> {
  return later('listInvoices');
}
export async function refund(
  _db: Db,
  _i: {
    orgId: string;
    invoiceId: string;
    amountCents: number;
    reason: string;
    operatorUserId: string;
    idempotencyKey: string;
  },
  _gw?: BillingGateway,
): Promise<{ refundId: string; amountCents: number }> {
  return later('refund');
}
export async function extendTrial(
  _db: Db,
  _i: { orgId: string; days: number; operatorUserId: string },
  _gw?: BillingGateway,
): Promise<{ trialEnd: Date }> {
  return later('extendTrial');
}
export async function grantFreeAccount(
  _db: Db,
  _i: { orgId: string; until: Date; operatorUserId: string },
  _gw?: BillingGateway,
): Promise<{ freeUntil: Date }> {
  return later('grantFreeAccount');
}
export async function createCoupon(
  _db: Db,
  _i: {
    code: string;
    percentOff: number | null;
    amountOffCents: number | null;
    duration: 'once' | 'repeating' | 'forever';
    durationInMonths: number | null;
    maxRedemptions: number | null;
    expiresAt: Date | null;
    operatorUserId: string;
  },
  _gw?: BillingGateway,
): Promise<{ couponId: string; promotionCodeId: string; code: string }> {
  return later('createCoupon');
}
export async function listCoupons(_db: DbOrTx, _gw?: BillingGateway): Promise<CouponRow[]> {
  return later('listCoupons');
}
export async function getRevenueMetrics(
  _db: DbOrTx,
  _i: { since: Date; now?: Date },
): Promise<RevenueMetrics> {
  return later('getRevenueMetrics');
}
export async function reconcileAll(
  _db: Db,
  _gw?: BillingGateway,
): Promise<{ checked: number; drifted: number }> {
  return later('reconcileAll');
}
