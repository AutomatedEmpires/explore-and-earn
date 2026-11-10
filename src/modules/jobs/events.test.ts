import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import type { DbOrTx } from '@/lib/db';
import { eventSubscribers, type EventPayloads } from '@/server/event-subscribers';
import { emit, readEnvelope, type EventEnvelope } from './events';
import { outbox } from './schema';

// The test map names events outside EventPayloads, so call emit through an untyped view.
const emitAny = emit as unknown as (
  db: DbOrTx,
  event: string,
  payload: unknown,
  eventId: string,
  subscribers?: Record<string, string[]>,
) => Promise<void>;

const map = { 'x.happened': ['a.one', 'a.two'], 'x.ignored': [] };

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.delete(outbox);
});

const rows = () =>
  t.db
    .select({ topic: outbox.topic, dedupeKey: outbox.dedupeKey, payload: outbox.payload })
    .from(outbox)
    .orderBy(asc(outbox.topic));

describe('emit', () => {
  it('enqueues one envelope per subscriber topic, keyed <eventId>:<topic>', async () => {
    await emitAny(t.db, 'x.happened', { n: 1 }, 'e1', map);

    const envelope = { event: 'x.happened', eventId: 'e1', data: { n: 1 } };
    expect(await rows()).toEqual([
      { topic: 'a.one', dedupeKey: 'e1:a.one', payload: envelope },
      { topic: 'a.two', dedupeKey: 'e1:a.two', payload: envelope },
    ]);
  });

  it('adds nothing when the same event id is emitted again', async () => {
    await emitAny(t.db, 'x.happened', { n: 1 }, 'e1', map);
    await emitAny(t.db, 'x.happened', { n: 2 }, 'e1', map);
    expect(await rows()).toHaveLength(2);
  });

  it('writes nothing for an event without subscribers', async () => {
    await emitAny(t.db, 'x.ignored', { n: 1 }, 'e2', map);
    await emitAny(t.db, 'x.unknown', { n: 1 }, 'e3', map);
    expect(await rows()).toHaveLength(0);
  });

  it('rolls back with the transaction it runs in', async () => {
    await expect(
      t.db.transaction(async (tx) => {
        await emitAny(tx, 'x.happened', { n: 1 }, 'e4', map);
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await rows()).toHaveLength(0);
  });

  it('uses the shared subscriber map by default', async () => {
    const payload: EventPayloads['subscription.changed'] = {
      orgId: 'org-1',
      status: 'active',
      plan: 'professional',
    };
    await emit(t.db, 'subscription.changed', payload, 'e5');
    expect((await rows()).map((r) => r.topic)).toEqual([
      'discovery.sync_host',
      'hostpages.mark_public',
      'listings.enforce_slot_limit',
    ]);
  });
});

describe('eventSubscribers', () => {
  it('lists the SP2 and SP3 subscribers of each event', () => {
    expect(eventSubscribers['listing.published']).toEqual([
      'hostpages.notify_followers',
      'discovery.sync_listing',
    ]);
    expect(eventSubscribers['org.status_changed']).toEqual(['listings.close_for_org']);
    expect(eventSubscribers['location.updated']).toEqual([
      'locations.resolve_nws_grid',
      'discovery.sync_host',
    ]);
    expect(eventSubscribers['subscription.changed']).toEqual([
      'listings.enforce_slot_limit',
      'hostpages.mark_public',
      'discovery.sync_host',
    ]);
    expect(eventSubscribers['verification.decided']).toEqual(['listings.resume_screening']);
    for (const event of ['listing.changed', 'listing.closed', 'listing.removed'] as const) {
      expect(eventSubscribers[event]).toEqual(['discovery.sync_listing']);
    }
    expect(eventSubscribers['hostpage.updated']).toEqual(['discovery.sync_host']);
    for (const event of ['org.member_removed', 'billing.stripe_event'] as const) {
      expect(eventSubscribers[event]).toEqual([]);
    }
  });
});

describe('readEnvelope', () => {
  const closed: EventEnvelope<'listing.closed'> = {
    event: 'listing.closed',
    eventId: 'e6',
    data: { listingId: 'l1', orgId: 'o1', reason: 'host' },
  };

  it('returns an envelope of the expected event', () => {
    expect(readEnvelope(closed, 'listing.closed')).toEqual(closed);
  });

  it('throws on another event', () => {
    expect(() => readEnvelope(closed, 'listing.published')).toThrow(
      'Expected event listing.published',
    );
  });

  it('throws on a payload that is not an envelope', () => {
    expect(() => readEnvelope({ listingId: 'l1' }, 'listing.closed')).toThrow(
      'Expected event listing.closed',
    );
    expect(() => readEnvelope(null, 'listing.closed')).toThrow('Expected event listing.closed');
  });
});
