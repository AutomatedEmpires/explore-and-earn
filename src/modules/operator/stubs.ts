// Neutral stubs the operator workstream replaces. W0's guards call getActiveSanction.
import type { HandlerMap } from '@/modules/jobs';

export type ActiveSanction = { kind: 'suspend' | 'ban'; reason: string; endsAt: Date | null };

/** No account is sanctioned until W3 records sanctions. */
export async function getActiveSanction(
  _db: unknown,
  _subject: { userId?: string; orgId?: string },
): Promise<ActiveSanction | null> {
  return null;
}

export async function listNcmecSubmittedBefore(_db: unknown, _before: Date): Promise<unknown[]> {
  return [];
}

const noop: HandlerMap[string] = async () => {};

export const operatorJobHandlers: HandlerMap = {
  'operator.metrics_snapshot': noop,
  'operator.daily_digest': noop,
  'operator.heartbeat': noop,
  'operator.sanction_expiry': noop,
  'operator.clerk_ban': noop,
  'operator.refund': noop,
  'operator.org_sanction': noop,
};

