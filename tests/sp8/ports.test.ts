import { describe, expect, it } from 'vitest';
import * as launch from '@/modules/launch';
import * as operator from '@/modules/operator';
import * as privacy from '@/modules/privacy';
import * as support from '@/modules/support';

describe('SP8 ports', () => {
  it('re-exports functions and the launch-date topic from each module', () => {
    expect(launch.APPLY_LAUNCH_DATE_TOPIC).toBe('billing.apply_launch_date');
    expect(launch.getFoundingCount).toEqual(expect.any(Function));
    expect(launch.getStripe).toEqual(expect.any(Function));

    expect(support.getSubscriptionState).toEqual(expect.any(Function));
    expect(support.getOrgSummaries).toEqual(expect.any(Function));
    expect(support.listMembers).toEqual(expect.any(Function));

    expect(privacy.getOwnershipSummary).toEqual(expect.any(Function));

    for (const value of [
      operator.createCoupon,
      operator.createFoundingCodes,
      operator.extendTrial,
      operator.getFoundingCount,
      operator.getOrgBillingSummary,
      operator.getRevenueMetrics,
      operator.getSubscriptionState,
      operator.grant,
      operator.grantFreeAccount,
      operator.listCoupons,
      operator.listInvoices,
      operator.reconcileAll,
      operator.refund,
      operator.restoreOrganization,
      operator.suspendOrganization,
      operator.getOrgSummaries,
      operator.listMembers,
      operator.countActiveListings,
      operator.countApplicationsSince,
      operator.listReportsAbout,
      operator.stopPromotionsForOrg,
      operator.operatorChangePlan,
    ]) {
      expect(value).toEqual(expect.any(Function));
    }
  });
});
