// The daily retention sweep (SP8 spec 8.3).
//
// `privacy.retention_sweep` (03:30 UTC) opens one `retention_runs` row per registered rule and
// queues one `privacy.retention_rule` job for it, so a slow or failing rule never holds up the
// others. A rule deletes at most RETENTION_BATCH rows per run; a full batch queues a follow-up
// run at once. A rule that throws or runs too long is recorded as failed and raises one alert
// per rule per day. Nothing is retried blindly: the next sweep runs the rule again.
//
// Other modules are loaded on first use, never at import time: their barrels import this module
// for the privacy types, so a static import here would be a cycle.
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { safeErrorMessage } from '@/lib/scrub';
import type { HandlerMap } from '@/modules/jobs';
import { consentRetentionRules } from './consent-rules';
import { coreRetentionRules } from './retention-rules';
import { privacyDeletionLedger, retentionRuns } from './schema';
import type { RetentionRule } from './types';

export const retentionRules: RetentionRule[] = [...coreRetentionRules, ...consentRetentionRules];

/** The most rows one run deletes. A run that deletes this many queues a follow-up. */
export const RETENTION_BATCH = 5000;
/** A rule that runs longer than this is recorded as failed. */
export const RETENTION_TIMEOUT_MS = 60_000;

export const RETENTION_SWEEP_TOPIC = 'privacy.retention_sweep';
export const RETENTION_RULE_TOPIC = 'privacy.retention_rule';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

export type RetentionDeps = {
  /** Defaults to every registered rule. */
  rules?: readonly RetentionRule[];
  timeoutMs?: number;
  batch?: number;
};

export type RetentionRunResult = { deleted: number; status: 'ok' | 'partial' | 'failed' };

async function registeredRules(): Promise<readonly RetentionRule[]> {
  return (await import('@/server/privacy-registry')).privacyRegistry.rules;
}

/** The UTC day `now` falls in: `[start, end)`. */
function utcDay(now: Date): { start: Date; end: Date; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + DAY_MS), label: start.toISOString().slice(0, 10) };
}

async function openRun(
  db: DbOrTx,
  i: { key: string; runId: string; now: Date; dedupeKey: string },
): Promise<void> {
  const { enqueue } = await import('@/modules/jobs');
  await db
    .insert(retentionRuns)
    .values({ id: i.runId, ruleKey: i.key, startedAt: i.now, status: 'running' });
  await enqueue(db, {
    topic: RETENTION_RULE_TOPIC,
    payload: { key: i.key, runId: i.runId },
    dedupeKey: i.dedupeKey,
  });
}

/**
 * Opens today's run for each rule and queues its job (dedupe `retention:<key>:<YYYY-MM-DD>`).
 * A rule that already has a run today is skipped, so running the sweep twice opens nothing new.
 */
export async function runRetentionSweep(
  db: Db,
  now: Date,
  deps: RetentionDeps = {},
): Promise<{ queued: number }> {
  const rules = deps.rules ?? (await registeredRules());
  const day = utcDay(now);
  let queued = 0;
  for (const rule of rules) {
    const opened = await db.transaction(async (tx) => {
      const [today] = await tx
        .select({ id: retentionRuns.id })
        .from(retentionRuns)
        .where(
          and(
            eq(retentionRuns.ruleKey, rule.key),
            gte(retentionRuns.startedAt, day.start),
            lt(retentionRuns.startedAt, day.end),
          ),
        )
        .limit(1);
      if (today) return false;
      await openRun(tx, {
        key: rule.key,
        runId: newId(),
        now,
        dedupeKey: `retention:${rule.key}:${day.label}`,
      });
      return true;
    });
    if (opened) queued += 1;
  }
  return { queued };
}

/** Rejects after `ms`. The rule's own promise is left to settle; its late error is swallowed. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${Math.round(ms / 1000)} s`));
    }, ms);
  });
  work.catch(() => {});
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Runs one rule for one run row and records the outcome. It never throws for a failing rule:
 * the failure is the recorded result, and the next sweep tries again.
 *
 * A run row that is already finished returns its recorded result without running the rule
 * again, so a retried job never deletes a second batch under the same run.
 */
export async function runRetentionRule(
  db: Db,
  i: { key: string; runId: string; now: Date },
  deps: RetentionDeps = {},
): Promise<RetentionRunResult> {
  const batch = deps.batch ?? RETENTION_BATCH;
  const timeoutMs = deps.timeoutMs ?? RETENTION_TIMEOUT_MS;

  const [existing] = await db
    .select({ status: retentionRuns.status, deleted: retentionRuns.deleted })
    .from(retentionRuns)
    .where(eq(retentionRuns.id, i.runId));
  if (existing && existing.status !== 'running') {
    return { deleted: existing.deleted, status: existing.status };
  }
  if (!existing) {
    await db
      .insert(retentionRuns)
      .values({ id: i.runId, ruleKey: i.key, startedAt: i.now, status: 'running' })
      .onConflictDoNothing({ target: retentionRuns.id });
  }

  const rules = deps.rules ?? (await registeredRules());
  const rule = rules.find((candidate) => candidate.key === i.key);

  let deleted = 0;
  let status: RetentionRunResult['status'];
  let error: string | null = null;
  try {
    if (!rule) throw new Error(`No retention rule is registered as ${i.key}`);
    const result = await withTimeout(rule.run(db, i.now, batch), timeoutMs);
    deleted = result.deleted;
    status = deleted >= batch ? 'partial' : 'ok';
  } catch (err) {
    status = 'failed';
    error = safeErrorMessage(err).slice(0, MAX_ERROR_LENGTH);
    logger.error('retention rule failed', { key: i.key, runId: i.runId, err });
  }

  const { record } = await import('@/modules/audit');
  const day = utcDay(i.now);

  await db.transaction(async (tx) => {
    await tx
      .update(retentionRuns)
      .set({ finishedAt: new Date(), deleted, status, error })
      .where(eq(retentionRuns.id, i.runId));

    if (status === 'partial') {
      const nextRunId = newId();
      await openRun(tx, {
        key: i.key,
        runId: nextRunId,
        now: i.now,
        dedupeKey: `retention:${i.key}:${nextRunId}`,
      });
    }

    await record(tx, {
      actorType: 'system',
      actorId: null,
      action: 'privacy.retention_run',
      subjectType: 'retention_run',
      subjectId: i.runId,
      data: { key: i.key, deleted, status },
    });

    if (status === 'failed') {
      const [earlier] = await tx
        .select({ id: retentionRuns.id })
        .from(retentionRuns)
        .where(
          and(
            eq(retentionRuns.ruleKey, i.key),
            eq(retentionRuns.status, 'failed'),
            ne(retentionRuns.id, i.runId),
            gte(retentionRuns.startedAt, day.start),
            lt(retentionRuns.startedAt, day.end),
          ),
        )
        .limit(1);
      if (!earlier) {
        const { raiseAlert } = await import('@/modules/trust');
        await raiseAlert(tx, {
          severity: 'warning',
          kind: 'retention_failed',
          message: `A retention rule failed: ${i.key}.`,
          data: { key: i.key, runId: i.runId },
        });
      }
    }
  });

  return { deleted, status };
}

/**
 * Whether the deletion ledger already holds this user's erasure. The restore drill and a real
 * restore use it to tell a deletion the restored database already has from one to replay.
 */
export async function isErasureRecorded(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: privacyDeletionLedger.id })
    .from(privacyDeletionLedger)
    .where(eq(privacyDeletionLedger.userId, userId))
    .limit(1);
  return row !== undefined;
}

const rulePayload = z.object({ key: z.string().min(1), runId: z.uuid() });

export const retentionJobHandlers: HandlerMap = {
  [RETENTION_SWEEP_TOPIC]: async (_payload, { db, now }) => {
    await runRetentionSweep(db, now);
  },
  [RETENTION_RULE_TOPIC]: async (payload, { db, now }) => {
    const { key, runId } = rulePayload.parse(payload);
    await runRetentionRule(db, { key, runId, now });
  },
};
