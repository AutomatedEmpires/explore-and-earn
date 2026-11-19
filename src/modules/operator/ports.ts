import type { Db } from '@/lib/db';
import {
  createCoupon,
  createFoundingCodes,
  extendTrial,
  getFoundingCount,
  getOrgBillingSummary,
  getRevenueMetrics,
  getSubscriptionState,
  grantFreeAccount,
  listCoupons,
  listInvoices,
  reconcileAll,
  refund,
  restoreOrganization,
  suspendOrganization,
  type PlanChoice,
} from '@/modules/billing';
import { changePlan } from '@/modules/billing';
import { grant } from '@/modules/entitlements';
import { countActiveListings } from '@/modules/listings';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { countApplicationsSince } from '@/modules/applications';
import { listReportsAbout } from '@/modules/safety';
import { stopPromotionsForOrg } from '@/modules/promote';

export {
  createCoupon,
  createFoundingCodes,
  extendTrial,
  getFoundingCount,
  getOrgBillingSummary,
  getRevenueMetrics,
  getSubscriptionState,
  grant,
  grantFreeAccount,
  listCoupons,
  listInvoices,
  reconcileAll,
  refund,
  restoreOrganization,
  suspendOrganization,
  getOrgSummaries,
  listMembers,
  countActiveListings,
  countApplicationsSince,
  listReportsAbout,
  stopPromotionsForOrg,
};

type PlanChange = { orgId: string; plan: PlanChoice['plan']; interval: PlanChoice['interval']; operatorUserId: string };

/** Operator plan changes report applied or failed, without the subscription payload. */
export async function operatorChangePlan(
  db: Db,
  i: PlanChange,
): Promise<{ status: 'applied' | 'failed' }> {
  const result = await changePlan(db, {
    orgId: i.orgId,
    plan: i.plan,
    interval: i.interval,
    extraSlots: 0,
    actorUserId: i.operatorUserId,
  });
  return { status: result.status };
}
