// Account deletion (SP8 spec 8.1 and 8.2, Plan decisions 9, 23 and 33). Erasure runs in waves
// through the outbox: every module except media and identity, for the person and for each
// organization only they belong to; then media, which keeps a file an earlier step still
// references; then the finalize step, which pseudonymizes the identity row, writes the ledger,
// deletes the Clerk user and sends the last email.
//
// A legal hold never blocks a request. Each step reads the subject's holds inside its own
// transaction and hands them to the module, which keeps the held scopes and reports them.
// When the hold is released, every module runs again for that request (the
// `privacy.hold_release_erase` job), so nothing stays once there is no basis to keep it.
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { safeErrorMessage } from '@/lib/scrub';
import { record } from '@/modules/audit';
import { clerkAdmin, findUserById, type ClerkAdmin } from '@/modules/identity';
import { enqueue } from '@/modules/jobs';
import {
  notify,
  sendDirectEmail,
  sendEmailNow,
  type EmailProvider,
} from '@/modules/notifications';
import type { PrivacyRegistry } from '@/server/privacy-registry';
import { activeHolds, HOLD_RELEASE_ERASE_TOPIC, holdReleasedSince } from './holds';
import { writeLedgerRow } from './ledger';
import { getOwnershipSummary } from './ports';
import {
  clipError,
  DEACTIVATE_TOPIC,
  ERASE_FINALIZE_TOPIC,
  ERASE_STEP_TOPIC,
  EXPORT_FINALIZE_TOPIC,
  EXPORT_STEP_TOPIC,
  findOpenRequest,
  isUniqueViolation,
  LEDGER_MIRROR_TOPIC,
  loadRequest,
  loadStep,
  openExceptionItem,
  privacySettingsUrl,
  requireRequester,
  resolveRegistry,
  subjectOf,
  UUID,
  type RequestRow,
  type Retained,
  type StepRow,
} from './requests';
import { privacyRequestSteps, privacyRequests } from './schema';
import { HOLD_SCOPES, type EraseResult, type HoldScope, type PrivacySubject } from './types';

/** Runs in the finalize step, after every other module (Plan decision 9). */
export const FINALIZE_MODULES = ['identity'] as const;
/** Runs after every other erase step, so it sees which files the kept records still use. */
export const LAST_WAVE_MODULES = ['media'] as const;

export type EraseDeps = {
  registry?: PrivacyRegistry;
  clerk?: ClerkAdmin;
  emailProvider?: EmailProvider;
  now?: Date;
};

const isFinalizeModule = (module: string) =>
  (FINALIZE_MODULES as readonly string[]).includes(module);
const isLastWave = (module: string) => (LAST_WAVE_MODULES as readonly string[]).includes(module);

const DELETED_PREFIX = 'deleted:';
const STARTED_SUBJECT = "We're deleting your Explore&Earn account";
const COMPLETED_SUBJECT = 'Your Explore&Earn account is deleted';
const HELD_LINE = 'Some records are kept to meet a legal obligation.';

/** SP4's application guard only lets an eraser through (Plan decision 9). */
async function allowErase(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
}

/**
 * The holds an eraser must respect for `subject`. An organization erased because its only
 * member asked to be deleted is also covered by that person's holds: a hold on everything
 * about them includes the organization only they ran.
 */
async function holdsFor(
  tx: DbOrTx,
  subject: PrivacySubject,
  requesterUserId: string,
): Promise<HoldScope[]> {
  const own = await activeHolds(tx, subject);
  if (subject.kind === 'user') return own;
  const requester = await activeHolds(tx, { kind: 'user', userId: requesterUserId });
  const held = new Set<HoldScope>([...own, ...requester]);
  return HOLD_SCOPES.filter((scope) => held.has(scope));
}

/**
 * True while the person's deletion request is open: asked for and neither finished nor failed.
 * The guards refuse such an account (`requireUser`). A finished deletion needs no check here:
 * the finalize step marks the account deleted in the transaction that completes the request.
 * The lookup is the one the open-request index serves, so it is cheap enough for every request.
 */
export async function isBeingErased(db: DbOrTx, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  return (await findOpenRequest(db, userId, 'delete')) !== null;
}

/** The requester first, then each organization the steps name, once. */
function subjectsOf(
  userId: string,
  steps: readonly Pick<StepRow, 'subjectKind' | 'subjectId'>[],
): PrivacySubject[] {
  const orgIds = new Set(
    steps.filter((step) => step.subjectKind === 'org').map((step) => step.subjectId),
  );
  return [
    { kind: 'user', userId },
    ...[...orgIds].sort().map((orgId): PrivacySubject => ({ kind: 'org', orgId })),
  ];
}

type Blocked = { blocked: true; orgIds: string[]; names: string[] };
type Started = { blocked: false; requestId: string; created: boolean; clerkUserId: string };

/**
 * Starts deleting the account. An Owner of an organization with other members must transfer
 * ownership first (`conflict`, `org_ownership`). A request already running is returned as is.
 * Call `kickWorker()` after it returns.
 */
export async function requestDeletion(
  db: Db,
  clerk: ClerkAdmin,
  userId: string,
  deps: EraseDeps = {},
): Promise<{ requestId: string }> {
  const requester = await requireRequester(db, userId);
  const registry = await resolveRegistry(deps.registry);

  const start = (): Promise<Blocked | Started> =>
    db.transaction(async (tx) => {
      // One deletion request per person at a time: a double click waits here.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`privacy_delete:${requester.id}`}, 0))`,
      );
      const user = await findUserById(tx, requester.id);
      if (!user) throw new Error('requestDeletion: the account disappeared');
      const open = await findOpenRequest(tx, user.id, 'delete');
      if (open) {
        return { blocked: false, requestId: open.id, created: false, clerkUserId: user.clerkUserId };
      }

      const orgs = await getOwnershipSummary(tx, user.id);
      const shared = orgs.filter((org) => org.role === 'owner' && org.otherMembers > 0);
      if (shared.length > 0) {
        return {
          blocked: true,
          orgIds: shared.map((org) => org.orgId),
          names: shared.map((org) => org.name),
        };
      }

      const requestId = newId();
      await tx.insert(privacyRequests).values({
        id: requestId,
        userId: user.id,
        kind: 'delete',
        status: 'running',
        notifyEmail: user.email,
      });

      const soleOwned = orgs.filter((org) => org.role === 'owner' && org.otherMembers === 0);
      const subjects: PrivacySubject[] = [
        { kind: 'user', userId: user.id },
        ...soleOwned.map((org): PrivacySubject => ({ kind: 'org', orgId: org.orgId })),
      ];
      const steps = subjects.flatMap((subject) =>
        registry.handlers
          .filter((handler) => !isFinalizeModule(handler.module))
          .map((handler) => ({
            id: newId(),
            requestId,
            subjectKind: subject.kind,
            subjectId: subject.kind === 'user' ? subject.userId : subject.orgId,
            module: handler.module,
            phase: 'erase' as const,
          })),
      );
      await tx.insert(privacyRequestSteps).values([
        ...steps,
        {
          id: newId(),
          requestId,
          subjectKind: 'user' as const,
          subjectId: user.id,
          module: FINALIZE_MODULES[0],
          phase: 'finalize' as const,
        },
      ]);

      await enqueue(tx, {
        topic: DEACTIVATE_TOPIC,
        payload: { requestId },
        dedupeKey: `privacy_deactivate:${requestId}`,
      });
      for (const step of steps.filter((s) => !isLastWave(s.module))) {
        await enqueue(tx, {
          topic: ERASE_STEP_TOPIC,
          payload: { stepId: step.id },
          dedupeKey: `privacy_step:${step.id}`,
        });
      }
      if (user.email) {
        await sendDirectEmail(tx, {
          to: user.email,
          template: 'PrivacyDeletion',
          dedupeKey: `privacy_deletion_started:${requestId}`,
          data: {
            subject: STARTED_SUBJECT,
            heading: STARTED_SUBJECT,
            lines: [
              "We've started deleting your account and data. You've been signed out.",
              "This can't be undone. We'll email you when it's finished, usually within a day.",
            ],
            button: null,
          },
        });
      }
      await record(tx, {
        actorType: 'user',
        actorId: user.id,
        action: 'privacy.deletion_requested',
        subjectType: 'privacy_request',
        subjectId: requestId,
        data: { orgCount: soleOwned.length },
      });
      return { blocked: false, requestId, created: true, clerkUserId: user.clerkUserId };
    });

  let outcome: Blocked | Started;
  try {
    outcome = await start();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const open = await findOpenRequest(db, requester.id, 'delete');
    if (!open) throw err;
    return { requestId: open.id };
  }

  if (outcome.blocked) {
    await record(db, {
      actorType: 'user',
      actorId: requester.id,
      action: 'privacy.deletion_blocked',
      subjectType: 'user',
      subjectId: requester.id,
      data: { orgIds: outcome.orgIds },
    });
    throw conflict(
      `Transfer ownership of ${outcome.names.join(', ')} before deleting your account.`,
      { reason: 'org_ownership', orgIds: outcome.orgIds },
    );
  }

  if (outcome.created) {
    // The fast path: sign-in stops now. The privacy.deactivate job retries a failure.
    try {
      await clerk.banUser(outcome.clerkUserId);
    } catch (err) {
      logger.warn('requestDeletion: could not deactivate at once; the job will retry', {
        requestId: outcome.requestId,
        error: err,
      });
    }
  }
  return { requestId: outcome.requestId };
}

/** The `privacy.deactivate` job: bans the Clerk user, unless they are already erased. */
export async function deactivateRequester(
  db: Db,
  requestId: string,
  deps: EraseDeps = {},
): Promise<void> {
  const request = await loadRequest(db, requestId);
  if (!request || request.kind !== 'delete') return;
  const user = await findUserById(db, request.userId);
  if (!user || user.clerkUserId.startsWith(DELETED_PREFIX)) return;
  await (deps.clerk ?? clerkAdmin()).banUser(user.clerkUserId);
}

/**
 * Queues what can run next: the last wave once every other erase step is done, then the
 * finalize step once every erase step is done. `suffix` makes a retry's keys new.
 */
export async function advanceErasure(db: DbOrTx, requestId: string, suffix = ''): Promise<void> {
  const steps = await db
    .select({
      id: privacyRequestSteps.id,
      module: privacyRequestSteps.module,
      status: privacyRequestSteps.status,
    })
    .from(privacyRequestSteps)
    .where(
      and(eq(privacyRequestSteps.requestId, requestId), eq(privacyRequestSteps.phase, 'erase')),
    );
  if (steps.some((step) => !isLastWave(step.module) && step.status !== 'done')) return;

  const lastWave = steps.filter((step) => isLastWave(step.module) && step.status !== 'done');
  for (const step of lastWave.filter((s) => s.status === 'pending')) {
    await enqueue(db, {
      topic: ERASE_STEP_TOPIC,
      payload: { stepId: step.id },
      dedupeKey: `privacy_step:${step.id}${suffix}`,
    });
  }
  if (lastWave.length > 0) return;

  await enqueue(db, {
    topic: ERASE_FINALIZE_TOPIC,
    payload: { requestId },
    dedupeKey: `privacy_erase_finalize:${requestId}${suffix}`,
  });
}

/**
 * Runs one module's eraser for one subject in its own transaction, then queues what comes
 * next. A step that is done changes nothing. A failure stores its (scrubbed) message on the
 * step and rethrows, so the job retries.
 */
export async function runEraseStep(db: Db, stepId: string, deps: EraseDeps = {}): Promise<void> {
  const step = await loadStep(db, stepId);
  if (!step || step.phase !== 'erase') return;
  const request = await loadRequest(db, step.requestId);
  if (!request || request.kind !== 'delete' || request.status === 'completed') return;

  if (step.status !== 'done') {
    const registry = await resolveRegistry(deps.registry);
    const handler = registry.handlerFor(step.module);
    const now = deps.now ?? new Date();
    try {
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ status: privacyRequestSteps.status })
          .from(privacyRequestSteps)
          .where(eq(privacyRequestSteps.id, step.id))
          .for('update');
        if (!locked || locked.status === 'done') return;
        await allowErase(tx);
        const subject = subjectOf(step);
        const holds = await holdsFor(tx, subject, request.userId);
        const result = await handler.erase(tx, subject, { requestId: request.id, now, holds });
        await tx
          .update(privacyRequestSteps)
          .set({
            status: 'done',
            erased: result.erased,
            retained: sql`${JSON.stringify(result.retained)}::jsonb`,
            lastError: null,
          })
          .where(eq(privacyRequestSteps.id, step.id));
      });
    } catch (err) {
      await db
        .update(privacyRequestSteps)
        .set({ lastError: clipError(safeErrorMessage(err)) })
        .where(eq(privacyRequestSteps.id, step.id));
      throw err;
    }
  }
  await advanceErasure(db, request.id);
}

function retainedOf(step: Pick<StepRow, 'retained'>): Retained {
  return Array.isArray(step.retained) ? (step.retained as Retained) : [];
}

/**
 * The finalize step. Each part is skipped once it is done, so a retry after a Clerk or email
 * failure picks up where the last run stopped:
 *  1. pseudonymize the identity row (which tombstones the Clerk id), write the ledger, complete
 *     the request;
 *  2. delete the Clerk user, whose id is kept only until Clerk confirms;
 *  3. send the completion email to the address captured at the start, then forget it.
 */
export async function finalizeDeletion(
  db: Db,
  requestId: string,
  deps: EraseDeps = {},
): Promise<void> {
  let request = await loadRequest(db, requestId);
  if (!request || request.kind !== 'delete' || request.status === 'failed') return;
  const now = deps.now ?? new Date();

  if (request.status !== 'completed') {
    const registry = await resolveRegistry(deps.registry);
    const identity = registry.handlerFor(FINALIZE_MODULES[0]);
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(privacyRequests)
        .where(eq(privacyRequests.id, requestId))
        .for('update');
      if (!current || current.status === 'completed') return;

      const steps = await tx
        .select()
        .from(privacyRequestSteps)
        .where(eq(privacyRequestSteps.requestId, requestId));
      if (steps.some((step) => step.phase === 'erase' && step.status !== 'done')) {
        throw new Error('privacy.erase_finalize: erase steps are not finished');
      }

      const user = await findUserById(tx, current.userId);
      if (!user) throw new Error('privacy.erase_finalize: the account row is missing');
      if (!user.clerkUserId.startsWith(DELETED_PREFIX)) {
        await tx
          .update(privacyRequests)
          .set({ clerkUserIdPending: user.clerkUserId })
          .where(eq(privacyRequests.id, requestId));
      }

      await allowErase(tx);
      const subject: PrivacySubject = { kind: 'user', userId: current.userId };
      const holds = await activeHolds(tx, subject);
      const result = await identity.erase(tx, subject, { requestId, now, holds });
      await tx
        .update(privacyRequestSteps)
        .set({
          status: 'done',
          erased: result.erased,
          retained: sql`${JSON.stringify(result.retained)}::jsonb`,
          lastError: null,
        })
        .where(
          and(
            eq(privacyRequestSteps.requestId, requestId),
            eq(privacyRequestSteps.phase, 'finalize'),
          ),
        );

      const ledger = await writeLedgerRow(tx, {
        userId: current.userId,
        requestId,
        erasedAt: now,
      });
      await tx
        .update(privacyRequests)
        .set({ status: 'completed', completedAt: now, blockedReason: null })
        .where(eq(privacyRequests.id, requestId));

      const retainedTables = new Set<string>(result.retained.map((r) => r.table));
      for (const step of steps) for (const r of retainedOf(step)) retainedTables.add(r.table);
      await record(tx, {
        actorType: 'system',
        actorId: null,
        action: 'privacy.deletion_completed',
        subjectType: 'privacy_request',
        subjectId: requestId,
        data: {
          modules: new Set(steps.map((step) => step.module)).size,
          retainedTables: [...retainedTables].sort(),
        },
      });
      await enqueue(tx, {
        topic: LEDGER_MIRROR_TOPIC,
        payload: { ledgerId: ledger.ledgerId },
        dedupeKey: `privacy_ledger_mirror:${ledger.ledgerId}`,
      });

      // A hold released while this deletion ran: steps that finished under it kept records
      // there is no longer a basis to keep. The release leaves a running request to this
      // step (holds.ts), and both lock the request row, so one of them queues the job.
      const keptUnderHold = [...steps.flatMap(retainedOf), ...result.retained].some(
        (r) => r.reason === 'legal_hold',
      );
      if (
        keptUnderHold &&
        (await holdReleasedSince(tx, subjectsOf(current.userId, steps), current.createdAt))
      ) {
        await enqueue(tx, {
          topic: HOLD_RELEASE_ERASE_TOPIC,
          payload: { requestId },
          dedupeKey: `privacy_hold_release_erase:${requestId}`,
        });
      }
    });
    request = await loadRequest(db, requestId);
    if (!request || request.status !== 'completed') return;
  }

  if (request.clerkUserIdPending) {
    // A Clerk failure throws here with the id still stored, so the retry can finish the job.
    await (deps.clerk ?? clerkAdmin()).deleteUser(request.clerkUserIdPending);
    await db
      .update(privacyRequests)
      .set({ clerkUserIdPending: null })
      .where(eq(privacyRequests.id, requestId));
  }

  if (request.notifyEmail) {
    const held = await db
      .select({ id: privacyRequestSteps.id })
      .from(privacyRequestSteps)
      .where(
        and(
          eq(privacyRequestSteps.requestId, requestId),
          sql`${privacyRequestSteps.retained} @> '[{"reason":"legal_hold"}]'::jsonb`,
        ),
      )
      .limit(1);
    await sendEmailNow(
      db,
      {
        to: request.notifyEmail,
        template: 'PrivacyDeletion',
        category: 'account',
        idempotencyKey: `privacy_deletion_completed:${requestId}`,
        data: {
          subject: COMPLETED_SUBJECT,
          heading: COMPLETED_SUBJECT,
          lines: ['Your account and data are deleted.', ...(held.length > 0 ? [HELD_LINE] : [])],
          button: null,
        },
      },
      deps.emailProvider ? { provider: deps.emailProvider } : {},
    );
    await db
      .update(privacyRequests)
      .set({ notifyEmail: null })
      .where(eq(privacyRequests.id, requestId));
  }

  // A retry an operator approved leaves the request flagged until everything above is done.
  await db
    .update(privacyRequestSteps)
    .set({ status: 'done', lastError: null })
    .where(
      and(
        eq(privacyRequestSteps.requestId, requestId),
        eq(privacyRequestSteps.phase, 'finalize'),
        ne(privacyRequestSteps.status, 'done'),
      ),
    );
  await db
    .update(privacyRequests)
    .set({ blockedReason: null })
    .where(and(eq(privacyRequests.id, requestId), isNotNull(privacyRequests.blockedReason)));
}

/** Called in the eraser's transaction with what one module did for one subject. */
type AfterErase = (
  tx: Tx,
  module: string,
  subject: PrivacySubject,
  result: EraseResult,
) => Promise<void>;

/**
 * Runs every module's eraser straight through, in the order a deletion uses: every module but
 * media and identity for each subject, then media, then identity for the person. Each call has
 * its own transaction and reads the subject's holds inside it. Returns the number of modules.
 */
async function eraseInOrder(
  db: Db,
  i: { userId: string; requestId: string; subjects: readonly PrivacySubject[] },
  deps: Pick<EraseDeps, 'registry' | 'now'>,
  after?: AfterErase,
): Promise<number> {
  const registry = await resolveRegistry(deps.registry);
  const now = deps.now ?? new Date();
  const user: PrivacySubject = { kind: 'user', userId: i.userId };

  const run = (module: string, subject: PrivacySubject) =>
    db.transaction(async (tx) => {
      await allowErase(tx);
      const holds = await holdsFor(tx, subject, i.userId);
      const result = await registry
        .handlerFor(module)
        .erase(tx, subject, { requestId: i.requestId, now, holds });
      await after?.(tx, module, subject, result);
    });

  const modules = registry.handlers.map((handler) => handler.module);
  const first = modules.filter((m) => !isLastWave(m) && !isFinalizeModule(m));
  const last = modules.filter((m) => isLastWave(m));
  for (const wave of [first, last]) {
    for (const mod of wave) for (const subject of i.subjects) await run(mod, subject);
  }
  for (const mod of FINALIZE_MODULES) await run(mod, user);
  return first.length + last.length + FINALIZE_MODULES.length;
}

/**
 * Erases the person again after a restore, straight through and in the same order: every
 * module but media and identity for the person and the organizations only they belong to, then
 * media, then identity, then the ledger row if the restored database lacks it. It calls no
 * Clerk API, sends no email and writes nothing to the mirror. The holds in the database are
 * respected, so the restore puts the mirrored holds back first (replay-deletions.ts).
 */
export async function replayErasure(
  db: Db,
  i: { userId: string; requestId: string },
  deps: Pick<EraseDeps, 'registry' | 'now'> = {},
): Promise<{ modules: number }> {
  const orgs = (await getOwnershipSummary(db, i.userId))
    .filter((org) => org.role === 'owner' && org.otherMembers === 0)
    .map((org): PrivacySubject => ({ kind: 'org', orgId: org.orgId }));
  const subjects: PrivacySubject[] = [{ kind: 'user', userId: i.userId }, ...orgs];
  const modules = await eraseInOrder(db, { ...i, subjects }, deps);
  await writeLedgerRow(db, {
    userId: i.userId,
    requestId: i.requestId,
    erasedAt: deps.now ?? new Date(),
  });
  return { modules };
}

/**
 * The `privacy.hold_release_erase` job (lead decision 2026-11-19): a legal hold was released,
 * so the finished deletion that kept records under it erases again. Every module runs, in
 * order, for the person and each organization the request's steps name (the memberships that
 * showed which organizations were theirs may be gone by now). A hold that is still open is
 * still respected. Each step's record is brought up to date, so the request no longer reports
 * records as held once they are gone. No Clerk call, no email, no new ledger row.
 *
 * A request that is not a finished deletion changes nothing. Safe to repeat.
 */
export async function eraseAfterHoldRelease(
  db: Db,
  requestId: string,
  deps: Pick<EraseDeps, 'registry' | 'now'> = {},
): Promise<{ modules: number }> {
  const request = await loadRequest(db, requestId);
  if (!request || request.kind !== 'delete' || request.status !== 'completed') {
    return { modules: 0 };
  }
  const steps = await db
    .select({
      subjectKind: privacyRequestSteps.subjectKind,
      subjectId: privacyRequestSteps.subjectId,
    })
    .from(privacyRequestSteps)
    .where(eq(privacyRequestSteps.requestId, request.id));
  const subjects = subjectsOf(request.userId, steps);

  const modules = await eraseInOrder(
    db,
    { userId: request.userId, requestId: request.id, subjects },
    deps,
    async (tx, module, subject, result) => {
      await tx
        .update(privacyRequestSteps)
        .set({
          erased: sql`coalesce(${privacyRequestSteps.erased}, 0) + ${result.erased}`,
          retained: sql`${JSON.stringify(result.retained)}::jsonb`,
        })
        .where(
          and(
            eq(privacyRequestSteps.requestId, request.id),
            eq(privacyRequestSteps.module, module),
            eq(privacyRequestSteps.subjectKind, subject.kind),
            eq(
              privacyRequestSteps.subjectId,
              subject.kind === 'user' ? subject.userId : subject.orgId,
            ),
          ),
        );
    },
  );
  await record(db, {
    actorType: 'system',
    actorId: null,
    action: 'privacy.hold_release_erased',
    subjectType: 'privacy_request',
    subjectId: request.id,
    data: { modules },
  });
  return { modules };
}

const stepPayload = z.object({ stepId: z.uuid() });
const requestPayload = z.object({ requestId: z.uuid() });

async function failedStepOf(db: DbOrTx, topic: string, payload: unknown): Promise<StepRow | null> {
  if (topic === EXPORT_STEP_TOPIC || topic === ERASE_STEP_TOPIC) {
    const parsed = stepPayload.safeParse(payload);
    return parsed.success ? loadStep(db, parsed.data.stepId) : null;
  }
  const parsed = requestPayload.safeParse(payload);
  if (!parsed.success) return null;
  const [step] = await db
    .select()
    .from(privacyRequestSteps)
    .where(
      and(
        eq(privacyRequestSteps.requestId, parsed.data.requestId),
        eq(privacyRequestSteps.phase, 'finalize'),
      ),
    );
  return step ?? null;
}

/**
 * What happens when a step's job is dead (Plan decision 11): the step is `failed`, the request
 * needs a person, a `support` item (priority 150) asks for one, and the requester is told once
 * that it is taking longer.
 */
export async function handleDeadStep(
  db: Db,
  topic: string,
  e: { payload: unknown; lastError: string },
): Promise<void> {
  const step = await failedStepOf(db, topic, e.payload);
  if (!step) return;
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, step.requestId))
      .for('update');
    if (!request || request.status === 'failed') return;
    // A finished deletion whose Clerk call or last email died still needs a person.
    const finished = request.status === 'completed';
    if (finished && !request.clerkUserIdPending && !request.notifyEmail) return;

    await tx
      .update(privacyRequestSteps)
      .set({ status: 'failed', lastError: clipError(e.lastError) })
      .where(eq(privacyRequestSteps.id, step.id));
    await tx
      .update(privacyRequests)
      .set({ blockedReason: 'step_failed', ...(finished ? {} : { status: 'needs_action' as const }) })
      .where(eq(privacyRequests.id, request.id));
    await openExceptionItem(tx, request, `${step.module} step failed`);

    const firstException = request.reviewItemId === null && request.blockedReason === null;
    if (firstException && !finished) {
      const user = await findUserById(tx, request.userId);
      await notify(tx, request.userId, 'privacy.request_delayed', {
        ...(request.kind === 'export'
          ? { url: privacySettingsUrl(user?.accountType ?? null) }
          : {}),
      });
    }
  });
}

/** True when a person can still usefully retry the request. */
function retryable(request: RequestRow): boolean {
  if (request.status === 'failed') return false;
  if (request.status !== 'completed') return true;
  return (
    request.kind === 'delete' && Boolean(request.clerkUserIdPending ?? request.notifyEmail)
  );
}

/**
 * An operator approved the request's support item: failed steps go back to `pending` and
 * everything that can run now is queued again, under keys that carry the item's id so the
 * outbox takes them.
 */
export async function retryRequest(
  db: DbOrTx,
  requestId: string,
  reviewItemId: string,
): Promise<void> {
  const request = await loadRequest(db, requestId);
  if (!request || !retryable(request)) return;
  const suffix = `:${reviewItemId}`;

  await db
    .update(privacyRequestSteps)
    .set({ status: 'pending', lastError: null })
    .where(
      and(eq(privacyRequestSteps.requestId, request.id), eq(privacyRequestSteps.status, 'failed')),
    );
  await db
    .update(privacyRequests)
    .set({
      ...(request.status === 'completed' ? {} : { status: 'running' as const }),
      ...(request.blockedReason === 'step_failed' ? { blockedReason: null } : {}),
    })
    .where(eq(privacyRequests.id, request.id));

  if (request.status === 'completed') {
    await enqueue(db, {
      topic: ERASE_FINALIZE_TOPIC,
      payload: { requestId: request.id },
      dedupeKey: `privacy_erase_finalize:${request.id}${suffix}`,
    });
    return;
  }

  const phase = request.kind === 'export' ? 'export' : 'erase';
  const pending = await db
    .select({ id: privacyRequestSteps.id, module: privacyRequestSteps.module })
    .from(privacyRequestSteps)
    .where(
      and(
        eq(privacyRequestSteps.requestId, request.id),
        eq(privacyRequestSteps.phase, phase),
        inArray(privacyRequestSteps.status, ['pending']),
      ),
    );
  const firstWave = request.kind === 'export' ? pending : pending.filter((s) => !isLastWave(s.module));
  for (const step of firstWave) {
    await enqueue(db, {
      topic: request.kind === 'export' ? EXPORT_STEP_TOPIC : ERASE_STEP_TOPIC,
      payload: { stepId: step.id },
      dedupeKey: `privacy_step:${step.id}${suffix}`,
    });
  }
  if (request.kind === 'delete') {
    await advanceErasure(db, request.id, suffix);
  } else if (pending.length === 0) {
    await enqueue(db, {
      topic: EXPORT_FINALIZE_TOPIC,
      payload: { requestId: request.id },
      dedupeKey: `privacy_export_finalize:${request.id}${suffix}`,
    });
  }
}
