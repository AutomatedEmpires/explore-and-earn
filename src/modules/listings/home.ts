// The host Home summary (spec section 7, Home row): the reminders a member should act on, the
// org's quota and its setup steps. SP5 owns the screen and renders this data.
import { and, count, eq, gt, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getSubscriptionState } from '@/modules/billing';
import { getBalance, getCapacity } from '@/modules/entitlements';
import { listOrgLocations } from '@/modules/locations';
import { getListingAccess, type ListingAccess } from '@/modules/orgs';
import { getVerificationStatus } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { listings } from './schema';
import { nextReminderAt } from './time';
import type { HomeReminder, HomeSummary } from './types';

const href = (id: string) => `/host/listings/${id}`;

function inScope(access: ListingAccess, l: { id: string; locationId: string | null }): boolean {
  if (access.all) return true;
  return (
    access.listingIds.includes(l.id) ||
    (l.locationId !== null && access.locationIds.includes(l.locationId))
  );
}

/**
 * Reminders follow the member: Recruiters see the "Still hiring?" of listings in their scope;
 * Owners and Admins also see approvals, verification and repost reminders; Billing members get
 * only the payment reminder. Every member gets the quota and setup.
 */
export async function getHomeSummary(
  db: DbOrTx,
  ctx: HostContext,
  now: Date = new Date(),
): Promise<HomeSummary> {
  const orgId = ctx.orgId;
  const ownerOrAdmin = ctx.role === 'owner' || ctx.role === 'admin';
  const sub = await getSubscriptionState(db, orgId);
  const reminders: HomeReminder[] = [];

  if (ctx.role !== 'billing') {
    const access = await getListingAccess(db, ctx);
    const reminded = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.orgId, orgId),
          eq(listings.state, 'active'),
          gt(listings.remindersSent, 0),
          isNotNull(listings.firstPublishedAt),
        ),
      );
    for (const l of reminded) {
      if (!l.firstPublishedAt || !inScope(access, l)) continue;
      const askedAt = nextReminderAt(l.firstPublishedAt, l.remindersSent - 1);
      if (l.confirmedActiveAt && l.confirmedActiveAt >= askedAt) continue;
      reminders.push({
        kind: 'still_hiring',
        listingId: l.id,
        title: `Still hiring for ${l.title ?? 'your listing'}?`,
        href: href(l.id),
        at: askedAt,
      });
    }
  }

  if (ownerOrAdmin) {
    const waiting = await db
      .select({ id: listings.id, title: listings.title, at: listings.updatedAt })
      .from(listings)
      .where(and(eq(listings.orgId, orgId), eq(listings.reviewStage, 'team_approval')));
    for (const l of waiting) {
      reminders.push({
        kind: 'approval',
        listingId: l.id,
        title: `${l.title ?? 'A listing'} is waiting for your approval`,
        href: href(l.id),
        at: l.at,
      });
    }

    if ((await getVerificationStatus(db, orgId)) === 'needs_info') {
      reminders.push({
        kind: 'verification',
        listingId: null,
        title: 'We need a little more information to verify your business',
        href: '/host/settings/verification',
        at: now,
      });
    }

    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const repost = await db
      .select({ id: listings.id, title: listings.title, at: listings.updatedAt })
      .from(listings)
      .where(
        and(
          eq(listings.orgId, orgId),
          eq(listings.repostRemindedYear, year),
          notInArray(listings.state, ['active', 'removed']),
          sql`not exists (select 1 from app.listings r
            where r.reposted_from_id = ${listings.id} and r.created_at >= ${yearStart}::timestamptz)`,
        ),
      );
    for (const l of repost) {
      reminders.push({
        kind: 'repost',
        listingId: l.id,
        title: `Time to repost ${l.title ?? 'your listing'}?`,
        href: href(l.id),
        at: l.at,
      });
    }
  }

  if ((ownerOrAdmin || ctx.role === 'billing') && sub.status === 'past_due') {
    reminders.push({
      kind: 'payment',
      listingId: null,
      title: "Your last payment didn't go through",
      href: '/host/billing',
      at: now,
    });
  }

  const [listingSlots, seats, inviteCredits, locations, published] = await Promise.all([
    getCapacity(db, orgId, 'listing_slot', now),
    getCapacity(db, orgId, 'seat', now),
    getBalance(db, orgId, 'invite_credit', now),
    listOrgLocations(db, orgId),
    db
      .select({ n: count() })
      .from(listings)
      .where(and(eq(listings.orgId, orgId), isNotNull(listings.firstPublishedAt))),
  ]);

  return {
    reminders: reminders.sort((a, b) => b.at.getTime() - a.at.getTime()),
    quota: {
      listingSlots: { used: listingSlots.used, limit: listingSlots.limit },
      seats: { used: seats.used, limit: seats.limit },
      inviteCredits: { balance: inviteCredits.balance, resetsAt: inviteCredits.resetsAt },
    },
    setup: {
      location: locations.length > 0,
      plan: sub.entitled,
      firstListing: Number(published[0]?.n ?? 0) > 0,
    },
  };
}
