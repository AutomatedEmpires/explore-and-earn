// Replays deletions after a restore (SP8 spec 8.11). A restored database is as old as its
// backup, so everyone erased since then is back in it. Within a minute of each erasure the
// privacy engine writes a ledger entry to the backup project (the "ledger mirror"); this reads
// the entries since the restore point and erases those users again.
//
// It is a dry run unless `apply` is true: by default it only reports what it would replay.
import type { Db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { findUserById } from '@/modules/identity';
import { isErasureRecorded } from '@/modules/privacy';

/** One mirrored erasure. The same shape the privacy engine writes (SP8 plan, Task 12). */
export type LedgerEntry = {
  ledgerId: string;
  userId: string;
  requestId: string;
  /** ISO time. */
  erasedAt: string;
};

export interface LedgerMirror {
  put(entry: LedgerEntry): Promise<void>;
  listSince(since: Date): Promise<LedgerEntry[]>;
}

/** Erases one user again: the engine's `replayErasure` (no Clerk call, email or mirror write). */
export type ReplayErasure = (db: Db, i: { userId: string; requestId: string }) => Promise<unknown>;

export type ReplayResult = {
  /** Erasures replayed in this run. Always 0 in a dry run. */
  replayed: number;
  /** Entries the database already reflects, or whose user it never held. */
  skipped: number;
  /** Entries a dry run found that `apply` would replay. Always 0 with `apply`. */
  pending: number;
  /** Ledger IDs whose replay threw. The run goes on to the next entry. */
  failed: string[];
};

/** The privacy engine's function, looked up when first needed. */
async function engineReplay(): Promise<ReplayErasure> {
  const privacy: Record<string, unknown> = await import('@/modules/privacy');
  const replay = privacy.replayErasure;
  if (typeof replay !== 'function') {
    throw new Error('not implemented: replayErasure (W1)');
  }
  return replay as ReplayErasure;
}

/** The engine's mirror of the backup project's `ledger` bucket. */
export async function engineLedgerMirror(): Promise<LedgerMirror> {
  const privacy: Record<string, unknown> = await import('@/modules/privacy');
  const get = privacy.getLedgerMirror;
  if (typeof get !== 'function') {
    throw new Error('not implemented: getLedgerMirror (W1)');
  }
  return (get as () => LedgerMirror)();
}

/**
 * Whether the database already reflects this erasure: the ledger row is there and the user row
 * is marked deleted. A user the database never held (created and erased after the restore
 * point) has nothing to erase and counts as reflected too.
 */
async function alreadyErased(db: Db, userId: string): Promise<boolean> {
  const user = await findUserById(db, userId);
  if (!user) return true;
  return user.deletedAt !== null && (await isErasureRecorded(db, userId));
}

/**
 * Replays every mirrored erasure with `erasedAt >= since`, oldest first. One failing entry
 * does not stop the rest: its ledger ID is returned in `failed`, and the caller must treat a
 * non-empty `failed` as an unfinished restore.
 */
export async function replayDeletions(
  db: Db,
  mirror: LedgerMirror,
  since: Date,
  o: { apply?: boolean; replay?: ReplayErasure } = {},
): Promise<ReplayResult> {
  const sinceMs = since.getTime();
  if (Number.isNaN(sinceMs)) throw new Error('replayDeletions: `since` is not a date');

  const entries = (await mirror.listSince(since))
    .filter((entry) => new Date(entry.erasedAt).getTime() >= sinceMs)
    .sort((a, b) => a.erasedAt.localeCompare(b.erasedAt));

  const result: ReplayResult = { replayed: 0, skipped: 0, pending: 0, failed: [] };
  let replay = o.replay;

  for (const entry of entries) {
    if (await alreadyErased(db, entry.userId)) {
      result.skipped += 1;
      continue;
    }
    if (!o.apply) {
      result.pending += 1;
      continue;
    }
    // A missing engine stops the run: nothing can be replayed without it.
    replay ??= await engineReplay();
    try {
      await replay(db, { userId: entry.userId, requestId: entry.requestId });
      result.replayed += 1;
    } catch (err) {
      result.failed.push(entry.ledgerId);
      // IDs only: the error object is scrubbed by the logger, and no personal data is logged.
      logger.error('replay-deletions: an erasure could not be replayed', {
        ledgerId: entry.ledgerId,
        err,
      });
    }
  }
  return result;
}
