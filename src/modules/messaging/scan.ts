// The message_scam scan. A classifier failure is warn, never clear (SP5 W4).
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { record } from '@/modules/audit';
import { searchAudit } from '@/modules/audit';
import { listOpenReviewItems, openReviewItem, runCheck } from '@/modules/trust';
import { deliverMessage } from './send';
import { messages } from './schema';
import { loadMessage, loadThread } from './threads';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scanHostText(
  db: Db,
  i: {
    subjectType: 'message' | 'invite' | 'interview' | 'offer' | 'bulk_message';
    subjectId: string;
    text: string;
    orgId: string;
  },
): Promise<{ state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] }> {
  const result = await runCheck(db, {
    kind: 'message_scam',
    subjectType: i.subjectType,
    subjectId: i.subjectId,
    text: i.text,
  });
  const state =
    result.decision === 'approved' ? 'clear' : result.decision === 'rejected' ? 'held' : 'warn';
  if (state === 'held') {
    await record(db, {
      actorType: 'system',
      actorId: null,
      orgId: i.orgId,
      action: 'messaging.text_held',
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      data: { subjectType: i.subjectType, subjectId: i.subjectId, labels: result.labels },
    });
    await openReviewItem(db, {
      queue: 'moderation',
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      reason: 'message_scam_held',
      checkId: result.checkId,
    });
    const since = new Date(Date.now() - DAY_MS);
    const held = await searchAudit(db, {
      orgId: i.orgId,
      action: 'messaging.text_held',
      from: since,
      limit: 50,
    });
    if (held.items.length >= 3) {
      const open = await listOpenReviewItems(db, 'organization', i.orgId);
      if (!open.some((item) => item.reason === 'repeated_scam_text')) {
        await openReviewItem(db, {
          queue: 'fraud',
          subjectType: 'organization',
          subjectId: i.orgId,
          reason: 'repeated_scam_text',
        });
      }
    }
  }
  return { state, checkId: result.checkId, labels: result.labels };
}

const scanPayload = z.object({ messageId: z.uuid() });

export async function runMessageScan(db: Db, payload: unknown): Promise<void> {
  const parsed = scanPayload.safeParse(payload);
  if (!parsed.success) return;
  const row = await loadMessage(db, parsed.data.messageId);
  if (!row || row.scanState !== 'pending' || row.kind !== 'text') return;
  const thread = await loadThread(db, row.threadId);
  if (!thread) return;
  const outcome = await scanHostText(db, {
    subjectType: 'message',
    subjectId: row.id,
    text: row.body ?? '',
    orgId: thread.orgId,
  });
  // State and delivery commit together. A retry must not skip a message whose release never landed.
  await withTx(db, async (tx) => {
    const updated = await tx
      .update(messages)
      .set({ scanState: outcome.state, scanLabels: outcome.labels, checkId: outcome.checkId })
      .where(and(eq(messages.id, row.id), eq(messages.scanState, 'pending')))
      .returning({ id: messages.id });
    if (updated.length === 0) return;
    if (outcome.state === 'clear' || outcome.state === 'warn') {
      await deliverMessage(tx, thread, row);
    }
  });
}
