// Invites against a real Postgres (CI's `integration` job; plan Task 14, spec failure mode 1).
// PGlite has one connection, so only a real server shows two invites racing for one seeker's
// last weekly slot, or one host's double click. Entitlements are real; SP2 listings and access,
// SP4 profiles and safety, and messaging use the SP5 fakes.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { PoolCard } from '@/lib/profiles';
import { getBalance, grant } from '@/modules/entitlements';
import { candidatePoolEntries } from '../schema';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));

import '../notification-types';
import { sendInvite } from './send';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);
const DAY = 86_400_000;
let startedAt = '';

beforeAll(async () => {
  const [row] = await queryRows<{ now: string }>(db, sql`select now()::text as now`);
  startedAt = row?.now ?? new Date().toISOString();
});

// The invite emails this file enqueues go too: the jobs worker test shares the database and
// runs every pending event, and it has no handler for them.
afterAll(async () => {
  await db.execute(sql`delete from app.outbox where created_at >= ${startedAt}::timestamptz`);
  await closeClient(db);
});

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
  profilesFake.reset();
  safetyFake.reset();
});

function card(seekerUserId: string): PoolCard {
  return {
    seekerUserId,
    firstName: 'Maya',
    lastInitial: 'R',
    city: 'Denver',
    region: 'CO',
    countryCode: 'US',
    availabilityDate: '2026-12-01',
    skills: [],
    avatarMediaId: null,
    coverMediaId: null,
    categories: ['seasonal'],
  };
}

async function poolSeeker(): Promise<string> {
  const { userId } = await seedSeeker(db);
  profilesFake.setPoolSeeker(card(userId), {
    seekerUserId: userId,
    categories: ['seasonal'],
    occupationCodes: [],
    availabilityDate: '2026-12-01',
    skillKeys: [],
    certifications: [],
    workAuthorization: { status: 'authorized' },
    minPay: null,
    willingToRelocate: false,
    preferredStates: [],
    region: 'CO',
    countryCode: 'US',
  });
  return userId;
}

async function hostWithCandidate(seekerUserId: string) {
  const org = await seedHostOrg(db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  await grant(db, {
    orgId: org.orgId,
    kind: 'invite_credit',
    quantity: 10,
    source: 'plan',
    sourceRef: `int_${newId()}`,
    validFrom: new Date(Date.now() - 60_000),
    idempotencyKey: `int:${newId()}`,
    actor: { type: 'system', id: null },
  });
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, publishedRevisionId: newId() });
  const candidateId = newId();
  await db.insert(candidatePoolEntries).values({
    id: candidateId,
    listingId,
    orgId: org.orgId,
    seekerUserId,
    eligible: true,
    computedAt: new Date(),
  });
  return { org, listingId, candidateId };
}

async function priorInvites(seekerUserId: string, sentBy: string, n: number): Promise<void> {
  for (let k = 0; k < n; k += 1) {
    await seedInvite(db, {
      orgId: newId(),
      listingId: newId(),
      seekerUserId,
      sentBy,
      sentAt: new Date(Date.now() - DAY),
    });
  }
}

async function consumptions(orgIds: string[]): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.entitlement_consumptions
        where subject_type = 'invite' and org_id = any(${`{${orgIds.join(',')}}`}::uuid[])`,
  );
  return row?.n ?? 0;
}

describe('sendInvite on Postgres', () => {
  it('refuses an 11th invite within 7 days and spends nothing (E4)', async () => {
    const seeker = await poolSeeker();
    const a = await hostWithCandidate(seeker);
    await priorInvites(seeker, a.org.owner.userId, 10);
    await expect(sendInvite(db, a.org.owner.ctx, { candidateId: a.candidateId })).rejects.toMatchObject({
      details: { reason: 'seeker_unavailable' },
    });
    expect((await getBalance(db, a.org.orgId, 'invite_credit')).balance).toBe(10);
  });

  it('lets exactly one of two hosts take the seeker last weekly slot (failure mode 1)', async () => {
    const seeker = await poolSeeker();
    const a = await hostWithCandidate(seeker);
    const b = await hostWithCandidate(seeker);
    await priorInvites(seeker, a.org.owner.userId, 9);
    const results = await Promise.allSettled([
      sendInvite(db, a.org.owner.ctx, { candidateId: a.candidateId }),
      sendInvite(db, b.org.owner.ctx, { candidateId: b.candidateId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ details: { reason: 'seeker_unavailable' } });
    expect(await consumptions([a.org.orgId, b.org.orgId])).toBe(1);
  });

  it('turns a double click into one invite and one credit', async () => {
    const seeker = await poolSeeker();
    const a = await hostWithCandidate(seeker);
    const results = await Promise.allSettled([
      sendInvite(db, a.org.owner.ctx, { candidateId: a.candidateId }),
      sendInvite(db, a.org.owner.ctx, { candidateId: a.candidateId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected[0]?.reason).toMatchObject({ details: { reason: 'already_invited' } });
    expect(await consumptions([a.org.orgId])).toBe(1);
    const rows = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.invites where listing_id = ${a.listingId}::uuid`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
