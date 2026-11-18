// In-memory stand-ins for the operator ports. Later tasks set the rows and read `calls`.
import type { OrgBillingSummary, RevenueMetrics } from '@/modules/billing';

type Call = { method: string; args: unknown[] };

export function operatorPortsFake() {
  const summaries = new Map<string, OrgBillingSummary>();
  const invoices = new Map<string, unknown[]>();
  let revenue: RevenueMetrics | null = null;
  let activeListings = 0;
  let applicationsSince = 0;
  let foundingCount = 0;
  let reports: unknown[] = [];
  const calls: Call[] = [];

  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return undefined;
    };

  return {
    calls,
    setBillingSummary(orgId: string, summary: OrgBillingSummary) {
      summaries.set(orgId, summary);
    },
    setInvoices(orgId: string, rows: unknown[]) {
      invoices.set(orgId, rows);
    },
    setRevenue(metrics: RevenueMetrics) {
      revenue = metrics;
    },
    setActiveListings(count: number) {
      activeListings = count;
    },
    setApplicationsSince(count: number) {
      applicationsSince = count;
    },
    setFoundingCount(count: number) {
      foundingCount = count;
    },
    setReports(rows: unknown[]) {
      reports = rows;
    },
    async getOrgBillingSummary(_db: unknown, orgId: string) {
      return summaries.get(orgId) ?? null;
    },
    async listInvoices(_db: unknown, orgId: string) {
      return invoices.get(orgId) ?? [];
    },
    async getRevenueMetrics() {
      return revenue;
    },
    async countActiveListings() {
      return activeListings;
    },
    async countApplicationsSince() {
      return applicationsSince;
    },
    async getFoundingCount() {
      return foundingCount;
    },
    async listReportsAbout(...args: unknown[]) {
      calls.push({ method: 'listReportsAbout', args });
      return reports;
    },
    refund: record('refund'),
    extendTrial: record('extendTrial'),
    grantFreeAccount: record('grantFreeAccount'),
    operatorChangePlan: record('operatorChangePlan'),
    createCoupon: record('createCoupon'),
    createFoundingCodes: record('createFoundingCodes'),
    grant: record('grant'),
    suspendOrganization: record('suspendOrganization'),
    restoreOrganization: record('restoreOrganization'),
    stopPromotionsForOrg: record('stopPromotionsForOrg'),
  };
}
