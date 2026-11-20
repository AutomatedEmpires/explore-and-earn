// Replays deletions after a restore (SP8 spec 8.11). A restored database is as old as its
// backup, so everyone erased since then is back in it. Within a minute of each erasure the
// privacy engine writes a ledger entry to the backup project (the "ledger mirror"); this reads
// the entries from an hour before the restore point and erases those users again.
//
// Why an hour before: an entry's `erasedAt` comes from the erasing job's clock, read before
// the erasure commits, and the restore point comes from another machine's clock. An erasure
// that commits just after the snapshot is missing from the dump but can carry an `erasedAt` a
// little before the restore point. Starting early is safe: a user the restored database already
// shows as erased is skipped, so the only cost is a few entries read twice.
//
// Legal holds come first (lead decision 2026-11-19). A hold placed after the backup is missing
// from the restored database, and a replay would erase what it was keeping. The engine mirrors
// every hold beside the ledger, so the holds are put back before any erasure is replayed. If
// they cannot be read or written, the run stops there and replays nothing.
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

/** One mirrored legal hold: ids, a scope and times. The reason is never mirrored. */
export type HoldEntry = {
  holdId: string;
  userId: string | null;
  orgId: string | null;
  scope: 'all' | 'applications' | 'messages' | 'reports' | 'billing';
  /** A day, `YYYY-MM-DD`. */
  reviewAt: string;
  createdBy: string;
  /** ISO time. */
  createdAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
};

export interface LedgerMirror {
  put(entry: LedgerEntry): Promise<void>;
  listSince(since: Date): Promise<LedgerEntry[]>;
  putHold(entry: HoldEntry): Promise<void>;
  listHolds(): Promise<HoldEntry[]>;
}

/** Erases one user again: the engine's `replayErasure` (no Clerk call, email or mirror write). */
export type ReplayErasure = (db: Db, i: { userId: string; requestId: string }) => Promise<unknown>;

/**
 * Brings one hold in the database in line with its mirrored copy: the engine's
 * `applyMirroredHold`. With `apply: false` it only says what would change.
 */
export type ApplyHold = (
  db: Db,
  hold: HoldEntry,
  o: { apply: boolean },
) => Promise<'added' | 'released' | 'unchanged'>;

export type ReplayResult = {
  /** Erasures replayed in this run. Always 0 in a dry run. */
  replayed: number;
  /** Entries the database already reflects, or whose user it never held. */
  skipped: number;
  /** Entries a dry run found that `apply` would replay. Always 0 with `apply`. */
  pending: number;
  /** Ledger IDs whose replay threw. The run goes on to the next entry. */
  failed: string[];
  /**
   * Mirrored legal holds the database lacked or showed unreleased: `applied` with `apply`,
   * `pending` in a dry run.
   */
  holds: { applied: number; pending: number };
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

/** The privacy engine's function, looked up when first needed. */
async function engineApplyHold(): Promise<ApplyHold> {
  const privacy: Record<string, unknown> = await import('@/modules/privacy');
  const apply = privacy.applyMirroredHold;
  if (typeof apply !== 'function') {
    throw new Error('not implemented: applyMirroredHold');
  }
  return apply as ApplyHold;
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

/** How far before the restore point the replay starts (see the header). */
export const REPLAY_MARGIN_MS = 60 * 60 * 1000;

/** The oldest `erasedAt` a replay after restoring to `restorePoint` must cover. */
export function replayFrom(restorePoint: Date): Date {
  return new Date(restorePoint.getTime() - REPLAY_MARGIN_MS);
}

/**
 * Replays every mirrored erasure with `erasedAt >= replayFrom(since)`, oldest first. `since`
 * is the restore point: a backup manifest's `takenAt`. One failing entry does not stop the
 * rest: its ledger ID is returned in `failed`, and the caller must treat a non-empty `failed`
 * as an unfinished restore.
 *
 * Before any erasure, every mirrored legal hold is put back (see the header). A hold that
 * cannot be listed or written throws, and nothing is replayed.
 */
export async function replayDeletions(
  db: Db,
  mirror: LedgerMirror,
  since: Date,
  o: { apply?: boolean; replay?: ReplayErasure; applyHold?: ApplyHold } = {},
): Promise<ReplayResult> {
  if (Number.isNaN(since.getTime())) throw new Error('replayDeletions: `since` is not a date');
  const from = replayFrom(since);
  const fromMs = from.getTime();

  const entries = (await mirror.listSince(from))
    .filter((entry) => new Date(entry.erasedAt).getTime() >= fromMs)
    .sort((a, b) => a.erasedAt.localeCompare(b.erasedAt));

  const result: ReplayResult = {
    replayed: 0,
    skipped: 0,
    pending: 0,
    failed: [],
    holds: { applied: 0, pending: 0 },
  };

  // Holds first: the replay below reads them from this database. Any failure here throws,
  // so no erasure runs without the holds that should limit it.
  const mirroredHolds = await mirror.listHolds();
  if (mirroredHolds.length > 0) {
    const applyHold = o.applyHold ?? (await engineApplyHold());
    for (const hold of mirroredHolds) {
      const outcome = await applyHold(db, hold, { apply: o.apply === true });
      if (outcome === 'unchanged') continue;
      if (o.apply) result.holds.applied += 1;
      else result.holds.pending += 1;
    }
  }

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
