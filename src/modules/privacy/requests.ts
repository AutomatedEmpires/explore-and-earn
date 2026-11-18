// What the export and deletion engines share: who may ask, the request and step rows, the
// support item an exception opens, and the lists the account screens and the console read.
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { findUserById, getOperator, type UserRecord } from '@/modules/identity';
import { listOpenReviewItems, openReviewItem } from '@/modules/trust';
import type { PrivacyRegistry } from '@/server/privacy-registry';
import { privacyRequestSteps, privacyRequests } from './schema';
import type { EraseResult, PrivacySubject } from './types';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A request that still has work to do. At most one per user and kind (a unique index). */
export const OPEN_STATUSES = ['pending', 'running', 'needs_action'] as const;

export const EXPORT_STEP_TOPIC = 'privacy.export_step';
export const EXPORT_FINALIZE_TOPIC = 'privacy.export_finalize';
export const ERASE_STEP_TOPIC = 'privacy.erase_step';
export const ERASE_FINALIZE_TOPIC = 'privacy.erase_finalize';
export const DEACTIVATE_TOPIC = 'privacy.deactivate';
export const LEDGER_MIRROR_TOPIC = 'privacy.ledger_mirror';
export const REQUEST_WATCH_TOPIC = 'privacy.request_watch';

/** The trust subject of a privacy exception, and the queue priority the spec gives it. */
export const PRIVACY_REQUEST_SUBJECT = 'privacy_request';
const EXCEPTION_PRIORITY = 150;
const PAGE_SIZE = 50;
const LAST_ERROR_LENGTH = 500;

export type RequestRow = typeof privacyRequests.$inferSelect;
export type StepRow = typeof privacyRequestSteps.$inferSelect;
export type Retained = EraseResult['retained'];

/** Tests pass their own registry; everything else gets the process-wide one, loaded lazily. */
export async function resolveRegistry(given?: PrivacyRegistry): Promise<PrivacyRegistry> {
  if (given) return given;
  return (await import('@/server/privacy-registry')).privacyRegistry;
}

export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

export function clipError(message: string): string {
  return message.slice(0, LAST_ERROR_LENGTH);
}

/**
 * The live account asking for an export or a deletion. Operator accounts are refused: only the
 * Owner removes one (spec 8.1).
 */
export async function requireRequester(db: DbOrTx, userId: string): Promise<UserRecord> {
  const user = UUID.test(userId) ? await findUserById(db, userId) : null;
  if (!user || user.deletedAt) throw notFound('Account not found');
  if (user.accountType === 'operator' || (await getOperator(db, userId))) {
    throw forbidden('Operator accounts are removed by the Owner.', { reason: 'operator_account' });
  }
  return user;
}

/** Where a person manages their privacy requests. */
export function privacySettingsUrl(accountType: UserRecord['accountType']): string {
  return accountType === 'host' ? '/host/settings/privacy' : '/profile/privacy';
}

export function subjectOf(step: Pick<StepRow, 'subjectKind' | 'subjectId'>): PrivacySubject {
  return step.subjectKind === 'user'
    ? { kind: 'user', userId: step.subjectId }
    : { kind: 'org', orgId: step.subjectId };
}

export async function loadRequest(db: DbOrTx, requestId: string): Promise<RequestRow | null> {
  if (!UUID.test(requestId)) return null;
  const [row] = await db.select().from(privacyRequests).where(eq(privacyRequests.id, requestId));
  return row ?? null;
}

export async function loadStep(db: DbOrTx, stepId: string): Promise<StepRow | null> {
  if (!UUID.test(stepId)) return null;
  const [row] = await db
    .select()
    .from(privacyRequestSteps)
    .where(eq(privacyRequestSteps.id, stepId));
  return row ?? null;
}

/** The user's open request of `kind`, if any. */
export async function findOpenRequest(
  db: DbOrTx,
  userId: string,
  kind: RequestRow['kind'],
): Promise<RequestRow | null> {
  const [row] = await db
    .select()
    .from(privacyRequests)
    .where(
      and(
        eq(privacyRequests.userId, userId),
        eq(privacyRequests.kind, kind),
        inArray(privacyRequests.status, OPEN_STATUSES),
      ),
    );
  return row ?? null;
}

/**
 * Opens the `support` item for a request that needs a person, unless the request's last item is
 * still unresolved, and links it to the request. Returns the item that now stands for it.
 */
export async function openExceptionItem(
  tx: Tx,
  request: Pick<RequestRow, 'id' | 'kind'>,
  what: string,
): Promise<string> {
  const [open] = await listOpenReviewItems(tx, PRIVACY_REQUEST_SUBJECT, request.id);
  const itemId =
    open?.id ??
    (
      await openReviewItem(tx, {
        queue: 'support',
        subjectType: PRIVACY_REQUEST_SUBJECT,
        subjectId: request.id,
        priority: EXCEPTION_PRIORITY,
        reason: `Privacy request needs attention: ${request.kind}, ${what}`,
      })
    ).id;
  await tx
    .update(privacyRequests)
    .set({ reviewItemId: itemId })
    .where(eq(privacyRequests.id, request.id));
  return itemId;
}

/** The person's own requests, the newest 20. */
export async function listPrivacyRequests(
  db: DbOrTx,
  userId: string,
): Promise<
  {
    id: string;
    kind: 'export' | 'delete';
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    exportExpiresAt: Date | null;
  }[]
> {
  if (!UUID.test(userId)) return [];
  return db
    .select({
      id: privacyRequests.id,
      kind: privacyRequests.kind,
      status: privacyRequests.status,
      createdAt: privacyRequests.createdAt,
      completedAt: privacyRequests.completedAt,
      exportExpiresAt: privacyRequests.exportExpiresAt,
    })
    .from(privacyRequests)
    .where(eq(privacyRequests.userId, userId))
    .orderBy(desc(privacyRequests.id))
    .limit(20);
}

export type ConsolePrivacyRequest = {
  id: string;
  userId: string;
  kind: 'export' | 'delete';
  status: string;
  blockedReason: 'step_failed' | 'overdue' | null;
  reviewItemId: string | null;
  createdAt: Date;
  failedSteps: { module: string; lastError: string | null }[];
};

/**
 * The console's request list, 50 a page. `exceptions` holds the requests that need a person
 * (`needs_action`, or flagged with a `blocked_reason`), oldest first; `requests` holds every
 * request, newest first. `before` is the last id of the page before.
 */
export async function listPrivacyRequestsForConsole(
  db: DbOrTx,
  f: { tab: 'requests' | 'exceptions'; before?: string },
): Promise<{ items: ConsolePrivacyRequest[]; nextBefore: string | null }> {
  if (f.before !== undefined && !UUID.test(f.before)) throw badRequest('Invalid cursor');
  const exceptions = f.tab === 'exceptions';
  const filters: SQL[] = [];
  if (exceptions) {
    const needsPerson = or(
      eq(privacyRequests.status, 'needs_action'),
      isNotNull(privacyRequests.blockedReason),
    );
    if (needsPerson) filters.push(needsPerson);
  }
  // Ids are UUIDv7, so id order is creation order.
  if (f.before) {
    filters.push(exceptions ? gt(privacyRequests.id, f.before) : lt(privacyRequests.id, f.before));
  }

  const rows = await db
    .select({
      id: privacyRequests.id,
      userId: privacyRequests.userId,
      kind: privacyRequests.kind,
      status: privacyRequests.status,
      blockedReason: privacyRequests.blockedReason,
      reviewItemId: privacyRequests.reviewItemId,
      createdAt: privacyRequests.createdAt,
    })
    .from(privacyRequests)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(exceptions ? asc(privacyRequests.id) : desc(privacyRequests.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);

  const failed =
    page.length === 0
      ? []
      : await db
          .select({
            requestId: privacyRequestSteps.requestId,
            module: privacyRequestSteps.module,
            lastError: privacyRequestSteps.lastError,
          })
          .from(privacyRequestSteps)
          .where(
            and(
              inArray(
                privacyRequestSteps.requestId,
                page.map((row) => row.id),
              ),
              eq(privacyRequestSteps.status, 'failed'),
            ),
          )
          .orderBy(asc(privacyRequestSteps.module), asc(privacyRequestSteps.id));
  const failedByRequest = new Map<string, { module: string; lastError: string | null }[]>();
  for (const step of failed) {
    const list = failedByRequest.get(step.requestId) ?? [];
    list.push({ module: step.module, lastError: step.lastError });
    failedByRequest.set(step.requestId, list);
  }

  return {
    items: page.map((row) => ({ ...row, failedSteps: failedByRequest.get(row.id) ?? [] })),
    nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}
