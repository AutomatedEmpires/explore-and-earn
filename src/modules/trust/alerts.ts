// Operator alerts: every Owner is notified (operator.alert, a mandatory type) and the alert is
// kept in the audit log as `trust.alert`, so it is never lost even when no Owner exists yet.
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { notify } from '@/modules/notifications';
import { activeOwners, isUuid } from './internal';

export type Alert = {
  severity: 'critical' | 'warning';
  /** What happened, for example `child_safety` or `sla_breach`. */
  kind: string;
  /** One sentence for the Owner. Never include the content under review. */
  message: string;
  /** Extra fields for the notification; `itemId` links it to a review item. */
  data?: Record<string, unknown>;
};

export async function raiseAlert(db: DbOrTx, a: Alert): Promise<void> {
  const owners = await activeOwners(db);
  const payload = { ...a.data, severity: a.severity, kind: a.kind, message: a.message };
  for (const owner of owners) {
    await notify(db, owner.userId, 'operator.alert', payload);
  }

  const itemId = a.data?.itemId;
  await record(db, {
    actorType: 'system',
    actorId: null,
    action: 'trust.alert',
    subjectType: isUuid(itemId) ? 'review_item' : 'alert',
    subjectId: isUuid(itemId) ? itemId : null,
    data: {
      severity: a.severity,
      kind: a.kind,
      message: a.message,
      data: a.data ?? {},
      notified: owners.map((o) => o.userId),
    },
  });

  const log = a.severity === 'critical' ? logger.error : logger.warn;
  if (owners.length === 0) {
    logger.error('operator alert has no Owner to notify', { kind: a.kind, severity: a.severity });
  } else {
    log('operator alert raised', { kind: a.kind, severity: a.severity, owners: owners.length });
  }
}
