// The seeker's As-described prompt. Answers are final; housing and meals are stored only when asked.
import { and, eq, gte, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { conflict, notFound } from '@/lib/errors';
import {
  AS_DESCRIBED_CLOSED,
  type AsDescribedPrompt,
  type AsDescribedSubmit,
} from '@/lib/hiring';
import { getHiringInfoMany } from '@/modules/listings';
import { getOrgSummaries } from '@/modules/orgs';
import { asDescribedResponses } from '../schema';
import { sharesHostDomain } from './eligibility';

function closed(): never {
  throw conflict(AS_DESCRIBED_CLOSED, { reason: 'closed' });
}

async function loadOwned(db: DbOrTx, seekerUserId: string, id: string) {
  const [row] = await db
    .select()
    .from(asDescribedResponses)
    .where(eq(asDescribedResponses.id, id));
  if (!row || row.seekerUserId !== seekerUserId) throw notFound();
  if (await sharesHostDomain(db, row.orgId, seekerUserId)) throw notFound();
  return row;
}

function stateOf(
  row: { submittedAt: Date | null; promptedAt: Date | null; expiresAt: Date | null },
  now: Date,
): AsDescribedPrompt['state'] {
  if (row.submittedAt) return 'submitted';
  if (!row.promptedAt || (row.expiresAt !== null && now > row.expiresAt)) return 'closed';
  return 'open';
}

export async function getAsDescribedPrompt(
  db: DbOrTx,
  seekerUserId: string,
  id: string,
  now: Date = new Date(),
): Promise<AsDescribedPrompt> {
  const row = await loadOwned(db, seekerUserId, id);
  const [orgs, listings] = await Promise.all([
    getOrgSummaries(db, [row.orgId]),
    getHiringInfoMany(db, [row.listingId]),
  ]);
  return {
    id: row.id,
    orgName: orgs.get(row.orgId)?.name ?? '',
    title: listings[0]?.title ?? '',
    asksWorkedHere: row.eligibleVia === 'offer_accepted',
    asksHousing: row.asksHousing,
    asksMeals: row.asksMeals,
    state: stateOf(row, now),
    closesAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export async function submitAsDescribed(
  db: DbOrTx,
  seekerUserId: string,
  id: string,
  input: AsDescribedSubmit,
  now: Date = new Date(),
): Promise<{ ok: true }> {
  const row = await loadOwned(db, seekerUserId, id);
  if (stateOf(row, now) !== 'open') closed();

  const [other] = await db
    .select({ id: asDescribedResponses.id })
    .from(asDescribedResponses)
    .where(
      and(
        eq(asDescribedResponses.listingId, row.listingId),
        eq(asDescribedResponses.seekerUserId, seekerUserId),
        ne(asDescribedResponses.id, id),
        isNotNull(asDescribedResponses.submittedAt),
      ),
    );
  if (other) closed();

  const updated = await db
    .update(asDescribedResponses)
    .set({
      workedHere: row.eligibleVia === 'offer_accepted' ? (input.workedHere ?? null) : null,
      housing: row.asksHousing ? (input.housing ?? null) : null,
      meals: row.asksMeals ? (input.meals ?? null) : null,
      pay: input.pay,
      submittedAt: now,
    })
    .where(
      and(
        eq(asDescribedResponses.id, id),
        eq(asDescribedResponses.seekerUserId, seekerUserId),
        isNull(asDescribedResponses.submittedAt),
        isNotNull(asDescribedResponses.promptedAt),
        or(isNull(asDescribedResponses.expiresAt), gte(asDescribedResponses.expiresAt, now)),
      ),
    )
    .returning({ id: asDescribedResponses.id });
  if (updated.length === 0) closed();
  return { ok: true };
}
