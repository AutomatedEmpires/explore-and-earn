// The message_scam scan. A classifier failure is warn, never clear (SP5 W4).
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { record } from '@/modules/audit';
import { searchAudit } from '@/modules/audit';
import {
  findLatestCheck,
  listOpenReviewItems,
  openReviewItem,
  runCheck,
  type CheckResult,
} from '@/modules/trust';
import { releaseMessage } from './send';
import { messages } from './schema';
import { loadMessage, loadThread } from './threads';

const DAY_MS = 24 * 60 * 60 * 1000;
const HELD = 'messaging.text_held';

type ScanSubject = {
  subjectType: 'message' | 'invite' | 'interview' | 'offer' | 'bulk_message';
  subjectId: string;
  orgId: string;
};

/**
 * Classifies a host text once per subject. A retried job reuses the stored check, so it neither
 * calls the classifier again nor opens a second review item, and a hold is recorded once.
 */
export async function scanHostText(
  db: Db,
  i: ScanSubject & { text: string },
): Promise<{ state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] }> {
  const subject = { kind: 'message_scam', subjectType: i.subjectType, subjectId: i.subjectId } as const;
  const result =
    (await findLatestCheck(db, subject)) ?? (await runCheck(db, { ...subject, text: i.text }));
  const state =
    result.decision === 'approved' ? 'clear' : result.decision === 'rejected' ? 'held' : 'warn';
  if (state === 'held') await recordHold(db, i, result);
  return { state, checkId: result.checkId, labels: result.labels };
}

/** The audit row, the moderation item and the repeat check for one held subject, written once. */
async function recordHold(db: Db, i: ScanSubject, result: CheckResult): Promise<void> {
  await withTx(db, async (tx) => {
    const earlier = await searchAudit(tx, {
      action: HELD,
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      limit: 1,
    });
    if (earlier.items.length > 0) return;
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: i.orgId,
      action: HELD,
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      data: { subjectType: i.subjectType, subjectId: i.subjectId, labels: result.labels },
    });
    await openReviewItem(tx, {
      queue: 'moderation',
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      reason: 'message_scam_held',
      checkId: result.checkId,
    });
    const held = await searchAudit(tx, {
      orgId: i.orgId,
      action: HELD,
      from: new Date(Date.now() - DAY_MS),
      limit: 50,
    });
    const subjects = new Set(held.items.map((row) => `${row.subjectType}:${row.subjectId}`));
    if (subjects.size < 3) return;
    const open = await listOpenReviewItems(tx, 'organization', i.orgId);
    if (!open.some((item) => item.reason === 'repeated_scam_text')) {
      await openReviewItem(tx, {
        queue: 'fraud',
        subjectType: 'organization',
        subjectId: i.orgId,
        reason: 'repeated_scam_text',
      });
    }
  });
}

const scanPayload = z.object({ messageId: z.uuid() });

type ScanOutcome = { state: 'clear' | 'warn' | 'held'; checkId: string | null; labels: string[] };

/**
 * A host message with files and no text has nothing for the text classifier, which refuses
 * empty text. It goes out with the warning banner, since a file can carry the payment request.
 */
const ATTACHMENT_ONLY: ScanOutcome = { state: 'warn', checkId: null, labels: ['attachment_only'] };

export async function runMessageScan(db: Db, payload: unknown): Promise<void> {
  const parsed = scanPayload.safeParse(payload);
  if (!parsed.success) return;
  const row = await loadMessage(db, parsed.data.messageId);
  if (!row || row.scanState !== 'pending' || row.kind !== 'text') return;
  const thread = await loadThread(db, row.threadId);
  if (!thread) return;
  const attachmentOnly = !row.body?.trim() && row.attachmentMediaIds.length > 0;
  const outcome: ScanOutcome = attachmentOnly
    ? ATTACHMENT_ONLY
    : await scanHostText(db, {
        subjectType: 'message',
        subjectId: row.id,
        text: row.body ?? '',
        orgId: thread.orgId,
      });
  const stored = { scanLabels: outcome.labels, checkId: outcome.checkId };
  // State and delivery commit together. A retry must not skip a message whose release never landed.
  await withTx(db, async (tx) => {
    if (outcome.state === 'held') {
      await tx
        .update(messages)
        .set({ scanState: 'held', ...stored })
        .where(and(eq(messages.id, row.id), eq(messages.scanState, 'pending')));
      return;
    }
    await releaseMessage(tx, row, 'pending', { scanState: outcome.state, ...stored });
  });
}
