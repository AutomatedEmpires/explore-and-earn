// Stripe customers: one per org, created once (idempotency key `customer:<orgId>`) and kept on
// the org's billing account.
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { billingGateway, type BillingGateway } from './gateway';
import { billingAccounts } from './schema';

/** The org's Stripe customer id, creating the customer the first time. */
export async function ensureStripeCustomer(
  db: DbOrTx,
  orgId: string,
  gw: BillingGateway = billingGateway(),
): Promise<string> {
  const [existing] = await db
    .select({ id: billingAccounts.stripeCustomerId })
    .from(billingAccounts)
    .where(eq(billingAccounts.orgId, orgId));
  if (existing?.id) return existing.id;

  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org || org.deleted) throw notFound('Organization not found');
  const members = await listMembers(db, orgId);
  const owner =
    members.find((m) => m.userId === org.ownerUserId) ?? members.find((m) => m.role === 'owner');

  const { id } = await gw.createCustomer(
    { orgId, name: org.name, email: owner?.email ?? null },
    `customer:${orgId}`,
  );
  const [row] = await db
    .insert(billingAccounts)
    .values({ orgId, stripeCustomerId: id })
    .onConflictDoUpdate({
      target: billingAccounts.orgId,
      set: {
        stripeCustomerId: sql`coalesce(${billingAccounts.stripeCustomerId}, excluded.stripe_customer_id)`,
      },
    })
    .returning({ id: billingAccounts.stripeCustomerId });
  return row?.id ?? id;
}
