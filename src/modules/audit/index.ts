// Public API of the audit module (append-only audit log). Owned by W3 (Task 10).
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

export type AuditEventInput = {
  actorType: 'user' | 'operator' | 'system';
  actorId: string | null;
  orgId?: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  data?: Record<string, unknown>;
  requestId?: string | null;
  ipHash?: string | null;
};

/** Records an audit event in the caller's transaction. Stub (no-op): Task 10 replaces it. */
export async function record(_db: DbOrTx, _e: AuditEventInput): Promise<void> {}

export const jobHandlers: HandlerMap = {};
