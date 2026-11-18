// The invite part of `hiring.sweep` (every 5 minutes; SP5 spec 6 and 8.4). Sent invites expire
// 14 days after sending, or at the next sweep once their listing stops being live (plan decision
// 14: only `sent` invites expire). A delivered invite gets one reminder 48 hours before it
// expires; `expiring_reminded_at` keeps it to one.
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { withTx, type Db, type Tx } from '@/lib/db';
import { INVITES } from '@/lib/hiring';
import { getHiringInfoMany } from '@/modules/listings';
import { recordPipelineEvent } from '../core';
import { invites } from '../schema';
import { notifyInviteExpiring } from './notify';
import type { InviteRow } from './reads';
import { DELIVERED } from './status';

const HOUR_MS = 3_600_000;

async function expire(tx: Tx, rows: InviteRow[], now: Date): Promise<void> {
  if (rows.length === 0) return;
  const infos = await getHiringInfoMany(tx, [...new Set(rows.map((r) => r.listingId))]);
  const locations = new Map(infos.map((h) => [h.id, h.locationId]));
  for (const row of rows) {
    await recordPipelineEvent(tx, {
      orgId: row.orgId,
      listingId: row.listingId,
      locationId: locations.get(row.listingId) ?? null,
      inviteId: row.id,
      kind: 'invite_expired',
      actor: { type: 'system' },
      at: now,
    });
  }
}

export async function sweepInvites(db: Db, now: Date): Promise<void> {
  await withTx(db, async (tx) => {
    const lapsed = await tx
      .update(invites)
      .set({ status: 'expired' })
      .where(and(eq(invites.status, 'sent'), lte(invites.expiresAt, now)))
      .returning();
    await expire(tx, lapsed, now);
  });

  await withTx(db, async (tx) => {
    const open = await tx.selectDistinct({ listingId: invites.listingId }).from(invites).where(eq(invites.status, 'sent'));
    if (open.length === 0) return;
    const ids = open.map((r) => r.listingId);
    const live = new Set((await getHiringInfoMany(tx, ids)).filter((h) => h.status === 'active').map((h) => h.id));
    const stopped = ids.filter((id) => !live.has(id));
    if (stopped.length === 0) return;
    const closed = await tx
      .update(invites)
      .set({ status: 'expired' })
      .where(and(eq(invites.status, 'sent'), inArray(invites.listingId, stopped)))
      .returning();
    await expire(tx, closed, now);
  });

  await withTx(db, async (tx) => {
    const due = await tx
      .update(invites)
      .set({ expiringRemindedAt: now })
      .where(
        and(
          eq(invites.status, 'sent'),
          inArray(invites.scanState, [...DELIVERED]),
          isNull(invites.expiringRemindedAt),
          gt(invites.expiresAt, now),
          lte(invites.expiresAt, new Date(now.getTime() + INVITES.reminderHoursBefore * HOUR_MS)),
        ),
      )
      .returning();
    for (const row of due) await notifyInviteExpiring(tx, row);
  });
}
