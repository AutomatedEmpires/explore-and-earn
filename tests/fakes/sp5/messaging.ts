// In-memory messaging for hiring tests. listingScope, listingTeam and requireHiringCapability stay real.
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { NOT_SELECTED_DEFAULT, type ThreadCard, type ThreadEventCode } from '@/lib/messaging';

type Messaging = typeof import('@/modules/messaging');
type Call = { name: string; args: unknown[] };

type ThreadRow = {
  threadId: string;
  orgId: string;
  listingId: string;
  seekerUserId: string;
  applicationId?: string;
  inviteId?: string;
};

const CHECK = '11111111-1111-4111-8111-111111111111';
const threads = new Map<string, ThreadRow>();
const byPair = new Map<string, string>();
const undeliverable = new Set<string>();
const calls: Call[] = [];

function log(name: string, args: unknown[]): void {
  calls.push({ name, args });
}

export function resetMessaging(): void {
  threads.clear();
  byPair.clear();
  undeliverable.clear();
  calls.length = 0;
}

export function setUndeliverable(threadId: string): void {
  undeliverable.add(threadId);
}

async function ensureThread(
  _tx: Tx,
  i: {
    orgId: string;
    listingId: string;
    seekerUserId: string;
    applicationId?: string;
    inviteId?: string;
  },
): Promise<{ threadId: string; created: boolean }> {
  log('ensureThread', [i]);
  const key = `${i.listingId}:${i.seekerUserId}`;
  const existing = byPair.get(key);
  if (existing) return { threadId: existing, created: false };
  const threadId = newId();
  const row: ThreadRow = { threadId, ...i };
  threads.set(threadId, row);
  byPair.set(key, threadId);
  return { threadId, created: true };
}

async function postCard(
  _tx: Tx,
  threadId: string,
  card: ThreadCard,
  senderUserId: string | null,
): Promise<string> {
  log('postCard', [threadId, card, senderUserId]);
  return newId();
}

async function postEvent(
  _tx: Tx,
  threadId: string,
  e: { code: ThreadEventCode; visibleTo: 'all' | 'host' },
): Promise<string> {
  log('postEvent', [threadId, e]);
  return newId();
}

async function sendHostMessage(
  _tx: Tx,
  i: { threadId: string; senderUserId: string; body: string; bulkId?: string },
): Promise<string | null> {
  log('sendHostMessage', [i]);
  if (undeliverable.has(i.threadId)) return null;
  return newId();
}

async function setThreadReadOnly(
  _tx: Tx,
  threadId: string,
  reason: 'withdrawn' | 'blocked' | 'removed',
): Promise<void> {
  log('setThreadReadOnly', [threadId, reason]);
}

async function markThreadHired(_tx: Tx, threadId: string): Promise<void> {
  log('markThreadHired', [threadId]);
}

async function threadIdsForApplications(
  _db: DbOrTx,
  applicationIds: string[],
): Promise<Map<string, string>> {
  log('threadIdsForApplications', [applicationIds]);
  const out = new Map<string, string>();
  for (const id of applicationIds) {
    for (const row of threads.values()) {
      if (row.applicationId === id) out.set(id, row.threadId);
    }
  }
  return out;
}

async function getNotSelectedMessage(
  _db: DbOrTx,
  orgId: string,
): Promise<{ body: string; isDefault: boolean }> {
  log('getNotSelectedMessage', [orgId]);
  return { body: NOT_SELECTED_DEFAULT, isDefault: true };
}

async function unreadThreadCount(
  _db: DbOrTx,
  userId: string,
  o?: { orgId?: string },
): Promise<number> {
  log('unreadThreadCount', [userId, o]);
  return 0;
}

async function scanHostText(
  _db: Db,
  i: {
    subjectType: 'message' | 'invite' | 'interview' | 'offer' | 'bulk_message';
    subjectId: string;
    text: string;
    orgId: string;
  },
): Promise<{ state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] }> {
  log('scanHostText', [i]);
  const state = i.text.includes('__block__') ? 'held' : i.text.includes('__flag__') ? 'warn' : 'clear';
  return { state, checkId: CHECK, labels: [] };
}

export const messagingFake = {
  ensureThread,
  postCard,
  postEvent,
  sendHostMessage,
  setThreadReadOnly,
  markThreadHired,
  threadIdsForApplications,
  getNotSelectedMessage,
  unreadThreadCount,
  scanHostText,
  setUndeliverable,
  reset: resetMessaging,
  calls,
} satisfies Partial<Messaging> & {
  setUndeliverable: typeof setUndeliverable;
  reset: typeof resetMessaging;
  calls: Call[];
};
