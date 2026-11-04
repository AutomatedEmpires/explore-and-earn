// What the operator console reads about review items: counts per queue, filtered lists and one
// item in full (its AI check, notes and decisions).
//
// Review items, checks, notes and actions are the trust module's tables (drizzle/0400_trust.sql)
// and users are identity's. The console only reads them here, joined together, so these are
// raw SQL rather than deep imports of either module's schema. Every change goes through the
// trust module's own functions (claim, decide, ...).
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  QUEUES,
  type ActionStatus,
  type CheckDecision,
  type Queue,
  type ReviewAction,
  type ReviewStatus,
} from '@/modules/trust';
import {
  epochMs,
  isUuid,
  personName,
  requireDate,
  textArrayLiteral,
  toArray,
  toDate,
  toNumber,
} from './rows';

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'open',
  'assigned',
  'escalated',
  'resolved',
];

/** The status filter of the queue list: one status, every unresolved one, or everything. */
export type StatusFilter = ReviewStatus | 'unresolved' | 'all';

export function isQueue(value: unknown): value is Queue {
  return typeof value === 'string' && (QUEUES as readonly string[]).includes(value);
}

export function isStatusFilter(value: unknown): value is StatusFilter {
  return (
    value === 'unresolved' ||
    value === 'all' ||
    (typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value))
  );
}

// --- Access -----------------------------------------------------------------------------------

/** The operator looking at the console: their user id, role and queues (from the guard). */
export type ItemViewer = {
  userId: string;
  role: 'owner' | 'operator';
  queues: readonly string[];
};

/** Owners cover every queue; an operator covers the queues assigned to them. */
export function coversQueue(viewer: Pick<ItemViewer, 'role' | 'queues'>, queue: string): boolean {
  return viewer.role === 'owner' || viewer.queues.includes(queue);
}

/**
 * Whether `viewer` may open a review item. Queue assignment is the console's access boundary:
 * an item opens for the operators covering its queue (and Owners). One exception follows the
 * trust module's rule that any operator but a decision's author may give its second sign-off,
 * whatever queues they cover (trust.approveSecond): a decision waiting for one opens for
 * everyone who could give it, so it never waits on nobody.
 */
export function mayOpenItem(
  viewer: ItemViewer,
  item: { queue: string; actions: readonly Pick<ItemAction, 'status' | 'actorId'>[] },
): boolean {
  if (coversQueue(viewer, item.queue)) return true;
  return item.actions.some((a) => a.status === 'pending_second' && a.actorId !== viewer.userId);
}

/** listReviewItems' version of mayOpenItem, as SQL on `r` (app.review_items). */
function visibleTo(viewer: ItemViewer): SQL | null {
  if (viewer.role === 'owner') return null;
  const awaitingSignOff = isUuid(viewer.userId)
    ? sql`exists (
        select 1 from app.review_actions a
        where a.item_id = r.id and a.status = 'pending_second'
          and a.actor_operator_id <> ${viewer.userId}::uuid
      )`
    : sql`false`;
  return sql`(r.queue = any(${textArrayLiteral(viewer.queues)}::text[]) or ${awaitingSignOff})`;
}

// --- Counts -----------------------------------------------------------------------------------

export type QueueCount = {
  queue: Queue;
  /** Waiting for someone to claim it. */
  open: number;
  assigned: number;
  escalated: number;
  /** Unresolved and past its time limit. */
  overdue: number;
  /** Resolved in the last 24 hours. */
  resolvedToday: number;
};

/** One row per queue, in QUEUES order, including queues with nothing in them. */
export async function queueCounts(db: DbOrTx, now: Date = new Date()): Promise<QueueCount[]> {
  const rows = await queryRows<{
    queue: Queue;
    open: number;
    assigned: number;
    escalated: number;
    overdue: number;
    resolved_today: number;
  }>(
    db,
    sql`
      select
        r.queue,
        count(*) filter (where r.status = 'open')::int as open,
        count(*) filter (where r.status = 'assigned')::int as assigned,
        count(*) filter (where r.status = 'escalated')::int as escalated,
        count(*) filter (
          where r.status <> 'resolved' and r.sla_due_at < ${now}::timestamptz
        )::int as overdue,
        count(*) filter (
          where r.status = 'resolved'
            and r.resolved_at >= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}::timestamptz
        )::int as resolved_today
      from app.review_items r
      group by r.queue
    `,
  );
  const byQueue = new Map(rows.map((r) => [r.queue, r]));
  return QUEUES.map((queue) => {
    const r = byQueue.get(queue);
    return {
      queue,
      open: r?.open ?? 0,
      assigned: r?.assigned ?? 0,
      escalated: r?.escalated ?? 0,
      overdue: r?.overdue ?? 0,
      resolvedToday: r?.resolved_today ?? 0,
    };
  });
}

// --- Lists ------------------------------------------------------------------------------------

export type ItemSummary = {
  id: string;
  queue: Queue;
  status: ReviewStatus;
  subjectType: string;
  subjectId: string;
  reason: string;
  /** The classifier's score (0 to 1), when the item came from an AI check. */
  aiConfidence: number | null;
  priority: number;
  assigneeId: string | null;
  assigneeName: string | null;
  slaDueAt: Date;
  slaBreachedAt: Date | null;
  createdAt: Date;
  resolution: ReviewAction | null;
  resolvedAt: Date | null;
};

export type ItemFilter = {
  queue?: Queue;
  /** Only the items this operator may open (see mayOpenItem). */
  visibleTo?: ItemViewer;
  /** Default `unresolved`. */
  status?: StatusFilter;
  /** Only items held by this operator. */
  assigneeId?: string;
  /** 1 to 200, default 50. */
  limit?: number;
};

type ItemRow = {
  id: string;
  queue: Queue;
  status: ReviewStatus;
  subject_type: string;
  subject_id: string;
  reason: string;
  ai_confidence: number | string | null;
  priority: number;
  assignee_operator_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  sla_due_ms: number | string;
  sla_breached_ms: number | string | null;
  created_ms: number | string;
  resolution: ReviewAction | null;
  resolved_ms: number | string | null;
};

const itemColumns = sql`
  r.id, r.queue, r.status, r.subject_type, r.subject_id, r.reason, r.ai_confidence, r.priority,
  r.assignee_operator_id, au.display_name as assignee_name, au.email as assignee_email,
  ${epochMs(sql`r.sla_due_at`)} as sla_due_ms,
  ${epochMs(sql`r.sla_breached_at`)} as sla_breached_ms,
  ${epochMs(sql`r.created_at`)} as created_ms,
  r.resolution,
  ${epochMs(sql`r.resolved_at`)} as resolved_ms
`;

function toSummary(row: ItemRow): ItemSummary {
  return {
    id: row.id,
    queue: row.queue,
    status: row.status,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    reason: row.reason,
    aiConfidence: toNumber(row.ai_confidence),
    priority: row.priority,
    assigneeId: row.assignee_operator_id,
    assigneeName: row.assignee_operator_id
      ? personName(row.assignee_name, row.assignee_email)
      : null,
    slaDueAt: requireDate(row.sla_due_ms),
    slaBreachedAt: toDate(row.sla_breached_ms),
    createdAt: requireDate(row.created_ms),
    resolution: row.resolution,
    resolvedAt: toDate(row.resolved_ms),
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Review items matching the filter. Unresolved items come most urgent first (priority, then the
 * nearest time limit); resolved ones newest first. `total` counts every match, beyond `limit`.
 */
export async function listReviewItems(
  db: DbOrTx,
  f: ItemFilter = {},
): Promise<{ items: ItemSummary[]; total: number }> {
  const limit = Math.min(Math.max(Math.floor(f.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const status = f.status ?? 'unresolved';

  const where: SQL[] = [];
  if (f.queue) where.push(sql`r.queue = ${f.queue}`);
  const access = f.visibleTo ? visibleTo(f.visibleTo) : null;
  if (access) where.push(access);
  if (status === 'unresolved') where.push(sql`r.status <> 'resolved'`);
  else if (status !== 'all') where.push(sql`r.status = ${status}`);
  if (f.assigneeId !== undefined) {
    if (!isUuid(f.assigneeId)) return { items: [], total: 0 };
    where.push(sql`r.assignee_operator_id = ${f.assigneeId}::uuid`);
  }
  const condition = where.length > 0 ? sql`where ${sql.join(where, sql` and `)}` : sql``;
  const order =
    status === 'resolved'
      ? sql`r.resolved_at desc, r.id desc`
      : sql`(r.status = 'resolved'), r.priority desc, r.sla_due_at asc, r.id asc`;

  const rows = await queryRows<ItemRow & { total: number }>(
    db,
    sql`
      select ${itemColumns}, count(*) over ()::int as total
      from app.review_items r
      left join app.users au on au.id = r.assignee_operator_id
      ${condition}
      order by ${order}
      limit ${limit}
    `,
  );
  return { items: rows.map(toSummary), total: rows[0]?.total ?? 0 };
}

// --- One item ---------------------------------------------------------------------------------

export type ItemCheck = {
  id: string;
  kind: string;
  provider: string;
  model: string;
  promptVersion: string;
  /** Null when the classifier failed. */
  score: number | null;
  labels: string[];
  reason: string;
  decision: CheckDecision;
  createdAt: Date;
};

export type ItemNote = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: Date;
};

export type ItemAction = {
  id: string;
  action: ReviewAction;
  actorId: string;
  actorName: string;
  status: ActionStatus;
  amountCents: number | null;
  secondOperatorId: string | null;
  secondOperatorName: string | null;
  createdAt: Date;
};

export type ItemDetail = ItemSummary & {
  check: ItemCheck | null;
  escalatedTo: string | null;
  escalatedToName: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  originalItemId: string | null;
  /** Operators kept off this item while someone else is available (an appeal's deciders). */
  excludeOperatorIds: string[];
  notes: ItemNote[];
  /** Decisions, oldest first; at most one is `pending_second`. */
  actions: ItemAction[];
};

/** One review item with its check, notes and decisions, or null. */
export async function getReviewItem(db: DbOrTx, itemId: string): Promise<ItemDetail | null> {
  if (!isUuid(itemId)) return null;
  const [row] = await queryRows<
    ItemRow & {
      escalated_to: string | null;
      escalated_name: string | null;
      escalated_email: string | null;
      decided_by: string | null;
      decided_name: string | null;
      decided_email: string | null;
      original_item_id: string | null;
      exclude_operator_ids: string[] | string;
      check_id: string | null;
    }
  >(
    db,
    sql`
      select ${itemColumns},
        r.escalated_to, eu.display_name as escalated_name, eu.email as escalated_email,
        r.decided_by, du.display_name as decided_name, du.email as decided_email,
        r.original_item_id, r.exclude_operator_ids, r.check_id
      from app.review_items r
      left join app.users au on au.id = r.assignee_operator_id
      left join app.users eu on eu.id = r.escalated_to
      left join app.users du on du.id = r.decided_by
      where r.id = ${itemId}::uuid
    `,
  );
  if (!row) return null;

  const [check] = row.check_id
    ? await queryRows<{
        id: string;
        kind: string;
        provider: string;
        model: string;
        prompt_version: string;
        score: number | string | null;
        labels: string[] | string;
        reason: string;
        decision: CheckDecision;
        created_ms: number | string;
      }>(
        db,
        sql`
          select id, kind, provider, model, prompt_version, score, labels, reason, decision,
            ${epochMs(sql`created_at`)} as created_ms
          from app.trust_checks where id = ${row.check_id}::uuid
        `,
      )
    : [];

  const notes = await queryRows<{
    id: string;
    author_operator_id: string;
    display_name: string | null;
    email: string | null;
    body: string;
    mentions: string[] | string;
    created_ms: number | string;
  }>(
    db,
    sql`
      select n.id, n.author_operator_id, u.display_name, u.email, n.body, n.mentions,
        ${epochMs(sql`n.created_at`)} as created_ms
      from app.review_notes n
      left join app.users u on u.id = n.author_operator_id
      where n.item_id = ${itemId}::uuid
      order by n.created_at, n.id
    `,
  );

  const actions = await queryRows<{
    id: string;
    action: ReviewAction;
    actor_operator_id: string;
    actor_name: string | null;
    actor_email: string | null;
    status: ActionStatus;
    amount_cents: number | string | null;
    second_operator_id: string | null;
    second_name: string | null;
    second_email: string | null;
    created_ms: number | string;
  }>(
    db,
    sql`
      select a.id, a.action, a.actor_operator_id, au.display_name as actor_name,
        au.email as actor_email, a.status, (a.data ->> 'amountCents') as amount_cents,
        a.second_operator_id, su.display_name as second_name, su.email as second_email,
        ${epochMs(sql`a.created_at`)} as created_ms
      from app.review_actions a
      left join app.users au on au.id = a.actor_operator_id
      left join app.users su on su.id = a.second_operator_id
      where a.item_id = ${itemId}::uuid
      order by a.created_at, a.id
    `,
  );

  return {
    ...toSummary(row),
    check: check
      ? {
          id: check.id,
          kind: check.kind,
          provider: check.provider,
          model: check.model,
          promptVersion: check.prompt_version,
          score: toNumber(check.score),
          labels: toArray(check.labels),
          reason: check.reason,
          decision: check.decision,
          createdAt: requireDate(check.created_ms),
        }
      : null,
    escalatedTo: row.escalated_to,
    escalatedToName: row.escalated_to ? personName(row.escalated_name, row.escalated_email) : null,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by ? personName(row.decided_name, row.decided_email) : null,
    originalItemId: row.original_item_id,
    excludeOperatorIds: toArray(row.exclude_operator_ids),
    notes: notes.map((n) => ({
      id: n.id,
      authorId: n.author_operator_id,
      authorName: personName(n.display_name, n.email),
      body: n.body,
      mentions: toArray(n.mentions),
      createdAt: requireDate(n.created_ms),
    })),
    actions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      actorId: a.actor_operator_id,
      actorName: personName(a.actor_name, a.actor_email),
      status: a.status,
      amountCents: toNumber(a.amount_cents),
      secondOperatorId: a.second_operator_id,
      secondOperatorName: a.second_operator_id ? personName(a.second_name, a.second_email) : null,
      createdAt: requireDate(a.created_ms),
    })),
  };
}

/** The queue of a review item, or null when there is no such item (for the session guard). */
export async function reviewItemQueue(db: DbOrTx, itemId: string): Promise<Queue | null> {
  if (!isUuid(itemId)) return null;
  const [row] = await queryRows<{ queue: Queue }>(
    db,
    sql`select queue from app.review_items where id = ${itemId}::uuid`,
  );
  return row?.queue ?? null;
}

/** The item and decision behind a review action, or null. */
export async function reviewActionInfo(
  db: DbOrTx,
  actionId: string,
): Promise<{ itemId: string; queue: Queue; action: ReviewAction; status: ActionStatus } | null> {
  if (!isUuid(actionId)) return null;
  const [row] = await queryRows<{
    item_id: string;
    queue: Queue;
    action: ReviewAction;
    status: ActionStatus;
  }>(
    db,
    sql`
      select a.item_id, r.queue, a.action, a.status
      from app.review_actions a join app.review_items r on r.id = a.item_id
      where a.id = ${actionId}::uuid
    `,
  );
  return row
    ? { itemId: row.item_id, queue: row.queue, action: row.action, status: row.status }
    : null;
}

export type MediaSubject = {
  kind: string;
  status: string;
  mime: string | null;
  altText: string | null;
  rejectionReason: string | null;
  /** Whether it has image variants (so it can be shown inline). */
  isImage: boolean;
};

/**
 * What the console needs to preview a `media` subject (media's table, read-only here). The
 * file itself is served through media.getMediaUrl, which checks who may see it.
 */
export async function mediaSubject(db: DbOrTx, mediaId: string): Promise<MediaSubject | null> {
  if (!isUuid(mediaId)) return null;
  const [row] = await queryRows<{
    kind: string;
    status: string;
    detected_mime: string | null;
    declared_mime: string | null;
    alt_text: string | null;
    rejection_reason: string | null;
    has_variants: boolean;
  }>(
    db,
    sql`
      select kind, status, detected_mime, declared_mime, alt_text, rejection_reason,
        (variants is not null) as has_variants
      from app.media where id = ${mediaId}::uuid
    `,
  );
  if (!row) return null;
  return {
    kind: row.kind,
    status: row.status,
    mime: row.detected_mime ?? row.declared_mime,
    altText: row.alt_text,
    rejectionReason: row.rejection_reason,
    isImage: row.has_variants,
  };
}
