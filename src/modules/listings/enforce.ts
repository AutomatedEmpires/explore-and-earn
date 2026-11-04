// Slot enforcement (spec section 8.6, Plan decisions 2 and 3): lapses and downgrades close
// listings here, never in billing (which can't import listings). Runs under the org lock, so it
// never races a publish or a billing sync.
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { getPendingKeepList, getSubscriptionState, settlePendingChange } from '@/modules/billing';
import { getCapacity, lockOrg } from '@/modules/entitlements';
import { readEnvelope } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import type { ListingRecord } from './access';
import { closeOne, type CloseReason } from './lifecycle';
import { revisionUnderReview } from './publish';
import { listingRevisions, listings } from './schema';
import { SLOT_HOLDING_STATES } from './slots';
import { billingContactUserIds } from './team';

/** A listing in review that was never live goes back to draft; nothing is emitted for it. */
async function returnToDraft(tx: DbOrTx, l: ListingRecord, reason: string, now: Date) {
  const rev = await revisionUnderReview(tx, l);
  if (rev && (rev.status === 'screening' || rev.status === 'in_review')) {
    await tx
      .update(listingRevisions)
      .set({
        status: 'rejected',
        decidedAt: now,
        checks: { ...(rev.checks ?? {}), reasons: [reason] },
      })
      .where(eq(listingRevisions.id, rev.id));
  }
  await tx
    .update(listings)
    .set({ state: 'draft', reviewStage: null, pendingRevisionId: null })
    .where(eq(listings.id, l.id));
}

/** Closes an active listing or returns a never-live one to draft; true when it closed. */
async function dropListing(tx: DbOrTx, l: ListingRecord, reason: CloseReason, now: Date) {
  if (l.state === 'active') {
    await closeOne(tx, l, reason, now);
    return true;
  }
  await returnToDraft(tx, l, reason, now);
  return false;
}

async function slotHolders(tx: Tx, orgId: string): Promise<ListingRecord[]> {
  return tx
    .select()
    .from(listings)
    .where(and(eq(listings.orgId, orgId), inArray(listings.state, [...SLOT_HOLDING_STATES])))
    .for('update');
}

/** Earliest first publish first (never-published last), then by id. */
function byFirstPublished(a: ListingRecord, b: ListingRecord): number {
  const at = a.firstPublishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.firstPublishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Brings the org's slot holders within its limit. Not entitled: every live listing closes with
 * `lapsed` and never-live ones in review return to draft. Over the limit: the pending change's
 * keep list (valid ids, at most the limit) stays, else the earliest first published; the rest
 * close with `downgrade` (never-live ones return to draft) and billing contacts hear which
 * closed. Always settles the pending billing change last.
 */
export async function enforceSlotLimit(
  db: DbOrTx,
  orgId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const sub = await getSubscriptionState(tx, orgId);
    const holders = await slotHolders(tx, orgId);

    let drop: ListingRecord[] = [];
    let reason: CloseReason = 'downgrade';
    if (!sub.entitled) {
      drop = holders;
      reason = 'lapsed';
    } else {
      const { limit } = await getCapacity(tx, orgId, 'listing_slot', now);
      if (holders.length > limit) {
        const ids = new Set(holders.map((h) => h.id));
        const keepList = (await getPendingKeepList(tx, orgId)) ?? [];
        const valid = [...new Set(keepList.filter((id) => ids.has(id)))].slice(
          0,
          Math.max(0, limit),
        );
        const keep = new Set(
          valid.length > 0
            ? valid
            : [...holders]
                .sort(byFirstPublished)
                .slice(0, Math.max(0, limit))
                .map((h) => h.id),
        );
        drop = holders.filter((h) => !keep.has(h.id));
      }
    }

    const closed: string[] = [];
    for (const l of drop.sort(byFirstPublished)) {
      if (await dropListing(tx, l, reason, now)) closed.push(l.title ?? 'Untitled listing');
    }
    if (reason === 'downgrade' && closed.length > 0) {
      for (const userId of await billingContactUserIds(tx, orgId)) {
        await notify(tx, userId, 'billing.plan_changed', { closed });
      }
    }
    await settlePendingChange(tx, orgId);
  });
}

/**
 * Closes every live listing of the org with `reason` (`org_suspended`, or `host` when the org
 * is deleted), each with its `listing.closed` and `listings.closed`. Never-live listings in
 * review return to draft, so screening can't publish them afterwards.
 */
export async function closeAllForOrg(
  db: DbOrTx,
  orgId: string,
  reason: 'org_suspended' | 'host',
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const l of await slotHolders(tx, orgId)) await dropListing(tx, l, reason, now);
  });
}

/** `listings.enforce_slot_limit` (`subscription.changed`). */
export async function enforceSlotLimitJob(db: DbOrTx, payload: unknown, now: Date) {
  const env = readEnvelope(payload, 'subscription.changed');
  await enforceSlotLimit(db, env.data.orgId, now);
}

/** `listings.close_for_org` (`org.status_changed`): only suspensions and bans close listings. */
export async function closeForOrgJob(db: DbOrTx, payload: unknown, now: Date) {
  const env = readEnvelope(payload, 'org.status_changed');
  if (env.data.status === 'suspended' || env.data.status === 'banned') {
    await closeAllForOrg(db, env.data.orgId, 'org_suspended', now);
  }
}
