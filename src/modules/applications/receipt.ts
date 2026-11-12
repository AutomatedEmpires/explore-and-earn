// The seeker's receipt for one application (SP4 spec 5 and 8.5), built from the row and its
// events only: never from SP2, so a closed or removed listing still has a receipt.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import {
  seekerStatus,
  TERMINAL_STATUSES,
  type ApplicationStatus,
  type ReceiptDto,
} from '@/lib/applications';
import { applicationEvents, type ApplicationEventRow, type ApplicationRow } from './schema';

/** The statuses a seeker may withdraw from (spec 8.5). */
export const WITHDRAWABLE: readonly ApplicationStatus[] = [
  'new',
  'shortlisted',
  'interviewing',
  'offered',
];

export function isTerminal(status: ApplicationStatus): boolean {
  return (TERMINAL_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/** An application's events, oldest first. */
export function loadEvents(db: DbOrTx, applicationId: string): Promise<ApplicationEventRow[]> {
  return db
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, applicationId))
    .orderBy(asc(applicationEvents.createdAt), asc(applicationEvents.id));
}

/**
 * What the seeker sees of the history: submitted, withdrawn, and each status change that reads
 * differently to them. A move between `new` and `shortlisted` is invisible (both are Applied),
 * the Additional step tick is not an event here, and a note is never included.
 */
function seekerEvents(events: readonly ApplicationEventRow[]): ReceiptDto['events'] {
  const out: ReceiptDto['events'] = [];
  for (const e of events) {
    if (e.type === 'additional_step_changed') continue;
    const view = seekerStatus(e.toStatus);
    if (e.type === 'status_changed' && out.at(-1)?.seekerStatus === view) continue;
    out.push({ type: e.type, seekerStatus: view, at: e.createdAt.toISOString() });
  }
  return out;
}

export async function buildReceipt(db: DbOrTx, row: ApplicationRow): Promise<ReceiptDto> {
  const events = await loadEvents(db, row.id);
  const terminal = isTerminal(row.status);
  return {
    applicationId: row.id,
    submittedAt: row.submittedAt.toISOString(),
    seekerStatus: seekerStatus(row.status),
    snapshot: row.snapshot,
    events: seekerEvents(events),
    additionalStepCompletedAt: row.additionalStepCompletedAt?.toISOString() ?? null,
    canWithdraw: WITHDRAWABLE.includes(row.status),
    canTickAdditionalStep: row.snapshot.listing.additionalStep !== null && !terminal,
  };
}
