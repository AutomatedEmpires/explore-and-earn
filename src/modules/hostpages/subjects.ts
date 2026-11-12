// What an operator's decision on a `host_page` review item does (SP2 spec section 6): approve
// applies the held change, remove discards it, ask_info passes the note to the Owner and Admins,
// and suspend or ban sanction the org. Registered when the module's index is imported.
//
// An item is about the change that was held when it opened. If the host has saved a newer change
// since, approving or removing the old item leaves the newer one alone: the item's check must be
// the one that holds the current change.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { sanctionOrg, type Actor } from '@/modules/billing';
import { registerSubjectHandlers } from '@/modules/trust';
import { HOST_PAGE_SUBJECT } from './check';
import { applyPending, discardPending, loadPage, type HostPageRow } from './editor';
import { CONTENT_HELD, notifyOwnerAdmins } from './notifications';

/** The deciding operator is recorded by trust on the review item. */
const OPERATOR: Actor = { type: 'operator', id: null };

const field = (data: unknown, key: string): string | null => {
  if (typeof data !== 'object' || data === null || !(key in data)) return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

/**
 * The org's held change, locked, if the decided item is about it. Reads the item's check from
 * app.review_items (read-only; trust owns the table and exposes no lookup by item id).
 */
async function heldChange(db: DbOrTx, orgId: string, data: unknown): Promise<HostPageRow | null> {
  const row = await loadPage(db, orgId, { lock: true });
  if (!row || row.pendingContent === null || row.pendingCheckId === null) return null;
  const itemId = field(data, 'reviewItemId');
  if (itemId) {
    const [item] = await queryRows<{ check_id: string | null }>(
      db,
      sql`select check_id from app.review_items where id = ${itemId}::uuid`,
    );
    if (item?.check_id !== row.pendingCheckId) return null;
  }
  return row;
}

registerSubjectHandlers(HOST_PAGE_SUBJECT, {
  approve: async (db, orgId, data) => {
    const row = await heldChange(db, orgId, data);
    if (row) await applyPending(db, row, 'review');
  },
  remove: async (db, orgId, data) => {
    const row = await heldChange(db, orgId, data);
    if (!row) return;
    await discardPending(db, orgId);
    await notifyOwnerAdmins(db, orgId, CONTENT_HELD, { rejected: true });
  },
  ask_info: async (db, orgId, data) => {
    const note = field(data, 'note');
    await notifyOwnerAdmins(db, orgId, CONTENT_HELD, {
      rejected: false,
      ...(note ? { note } : {}),
    });
  },
  suspend: (db, orgId) => sanctionOrg(db, orgId, 'suspend', OPERATOR),
  ban: (db, orgId) => sanctionOrg(db, orgId, 'ban', OPERATOR),
});
