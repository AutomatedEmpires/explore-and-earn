// W0 stub. The owning workstream replaces the body and keeps the name.
import type { DbOrTx, Tx } from '@/lib/db';
import type { ThreadCard, ThreadEventCode } from '@/lib/messaging';

export async function ensureThread(
  _tx: Tx,
  _i: {
    orgId: string;
    listingId: string;
    seekerUserId: string;
    applicationId?: string;
    inviteId?: string;
  },
): Promise<{ threadId: string; created: boolean }> {
  throw new Error('not implemented: ensureThread (W4)');
}

export async function postCard(
  _tx: Tx,
  _threadId: string,
  _card: ThreadCard,
  _senderUserId: string | null,
): Promise<string> {
  throw new Error('not implemented: postCard (W4)');
}

export async function postEvent(
  _tx: Tx,
  _threadId: string,
  _e: { code: ThreadEventCode; visibleTo: 'all' | 'host' },
): Promise<string> {
  throw new Error('not implemented: postEvent (W4)');
}

export async function setThreadReadOnly(
  _tx: Tx,
  _threadId: string,
  _reason: 'withdrawn' | 'blocked' | 'removed',
): Promise<void> {
  throw new Error('not implemented: setThreadReadOnly (W4)');
}

export async function markThreadHired(_tx: Tx, _threadId: string): Promise<void> {
  throw new Error('not implemented: markThreadHired (W4)');
}

export async function threadIdsForApplications(
  _db: DbOrTx,
  _applicationIds: string[],
): Promise<Map<string, string>> {
  return new Map();
}

export async function getThread(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: getThread (W4)');
}

export async function listThreads(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: listThreads (W4)');
}
