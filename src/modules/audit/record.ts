import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getRequestContext } from '@/server/request-context';
import { auditEvents } from './schema';

export type AuditEventInput = {
  actorType: 'user' | 'operator' | 'system';
  /** app.users id of the actor; null for the system. */
  actorId: string | null;
  orgId?: string | null;
  /** `<module>.<verb>`, for example `settings.updated`. */
  action: string;
  subjectType: string;
  subjectId: string | null;
  /** Stored after `redact()`. */
  data?: Record<string, unknown>;
  requestId?: string | null;
  ipHash?: string | null;
};

const SECRET_KEY = /secret|token|password|api[_-]?key/i;
const REDACTED = '[redacted]';
const CIRCULAR = '[circular]';

function redactValue(value: unknown, path: Set<object>): unknown {
  if (typeof value !== 'object' || value === null) return value;
  // Dates and similar serialize themselves; leave them as they are.
  if (!Array.isArray(value) && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return value;
  }
  if (path.has(value)) return CIRCULAR;

  path.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redactValue(item, path));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redactValue(item, path);
    }
    return out;
  } finally {
    path.delete(value);
  }
}

/**
 * A copy of `data` with the value of every key that looks like a secret (`secret`, `token`,
 * `password`, `api key`) replaced by `'[redacted]'`, at any depth, arrays included.
 */
export function redact(data: Record<string, unknown>): Record<string, unknown> {
  return redactValue(data, new Set()) as Record<string, unknown>;
}

/**
 * Appends an audit event. Pass the domain transaction so the event commits (or rolls back)
 * with the change it describes. Rows can never be changed or deleted afterwards.
 *
 * Inside a request (apiRoute), `requestId` defaults to the request's id and, for a user's or
 * an operator's action, `ipHash` to their hashed IP, so callers never have to thread them.
 */
export async function record(db: DbOrTx, e: AuditEventInput): Promise<void> {
  const request = getRequestContext();
  const ipHash = e.ipHash ?? (e.actorType === 'system' ? null : request?.ipHash);
  await db.insert(auditEvents).values({
    id: newId(),
    actorType: e.actorType,
    actorId: e.actorId,
    orgId: e.orgId ?? null,
    action: e.action,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    data: e.data === undefined ? null : sql`${JSON.stringify(redact(e.data))}::jsonb`,
    requestId: e.requestId ?? request?.requestId ?? null,
    ipHash: ipHash ?? null,
  });
}
