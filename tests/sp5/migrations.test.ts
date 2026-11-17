import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { seedHostOrg, seedSeeker } from '../helpers/sp2';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';

let t: TestDb;
let orgId: string;
let userId: string;

beforeAll(async () => {
  t = await createTestDb();
  orgId = (await seedHostOrg(t.db)).orgId;
  userId = (await seedSeeker(t.db)).userId;
});

afterAll(async () => {
  await t.close();
});

async function fails(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  expect(messages.join('\n')).toMatch(pattern);
}

describe('SP5 tables', () => {
  it('creates the 16 tables with row level security', async () => {
    const rows = await queryRows<{ relname: string; relrowsecurity: boolean }>(
      t.db,
      sql`select c.relname, c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'app' and c.relkind = 'r'
            and c.relname in (
              'pipeline_entries', 'pipeline_events', 'pending_passes', 'candidate_pool_runs',
              'candidate_pool_entries', 'invites', 'interviews', 'interview_slots', 'offers',
              'as_described_responses', 'threads', 'messages', 'thread_reads', 'saved_replies',
              'bulk_messages', 'org_reply_stats'
            )`,
    );
    expect(rows).toHaveLength(16);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it('rejects a pending status, a fit score of 101, and changes to pipeline events', async () => {
    const applicationId = newId();
    await fails(
      t.db.execute(sql`
        insert into app.pipeline_entries
          (application_id, org_id, listing_id, seeker_user_id, status, source, applied_at, last_status_at)
        values (${applicationId}, ${orgId}, ${newId()}, ${userId}, 'pending', 'seek', now(), now())
      `),
      /check constraint/,
    );
    await fails(
      t.db.execute(sql`
        insert into app.pipeline_entries
          (application_id, org_id, listing_id, seeker_user_id, status, source, applied_at, last_status_at, fit_score)
        values (${newId()}, ${orgId}, ${newId()}, ${userId}, 'new', 'seek', now(), now(), 101)
      `),
      /check constraint/,
    );
    const eventId = newId();
    await t.db.execute(sql`
      insert into app.pipeline_events (id, org_id, listing_id, kind, actor_type, occurred_at)
      values (${eventId}, ${orgId}, ${newId()}, 'applied', 'system', now())
    `);
    await fails(
      t.db.execute(sql`update app.pipeline_events set kind = 'hired' where id = ${eventId}`),
      /insert-only/,
    );
    await fails(
      t.db.execute(sql`delete from app.pipeline_events where id = ${eventId}`),
      /insert-only/,
    );
  });

  it('keeps one invite per listing and seeker, and notes to 300 characters', async () => {
    const listingId = newId();
    const seeker = userId;
    await t.db.execute(sql`
      insert into app.invites
        (id, org_id, listing_id, seeker_user_id, candidate_id, sent_by, status, scan_state, sent_at, expires_at)
      values (${newId()}, ${orgId}, ${listingId}, ${seeker}, ${newId()}, ${userId},
        'sent', 'clear', now(), now())
    `);
    await fails(
      t.db.execute(sql`
        insert into app.invites
          (id, org_id, listing_id, seeker_user_id, candidate_id, sent_by, status, scan_state, sent_at, expires_at)
        values (${newId()}, ${orgId}, ${listingId}, ${seeker}, ${newId()}, ${userId},
          'sent', 'clear', now(), now())
      `),
      /duplicate key|unique/,
    );
    await fails(
      t.db.execute(sql`
        insert into app.invites
          (id, org_id, listing_id, seeker_user_id, candidate_id, sent_by, note, status, scan_state, sent_at, expires_at)
        values (${newId()}, ${orgId}, ${newId()}, ${userId}, ${newId()}, ${userId},
          ${'n'.repeat(301)}, 'sent', 'clear', now(), now())
      `),
      /check constraint/,
    );
  });

  it('allows one active interview and the interview limits', async () => {
    const applicationId = newId();
    const base = {
      orgId,
      listingId: newId(),
      applicationId,
      threadId: newId(),
      organizer: userId,
    };
    await t.db.execute(sql`
      insert into app.interviews
        (id, org_id, listing_id, application_id, thread_id, organizer_user_id, status, format,
         timezone, duration_minutes, expiry_hours, scan_state)
      values (${newId()}, ${base.orgId}, ${base.listingId}, ${base.applicationId}, ${base.threadId},
        ${base.organizer}, 'invited', 'phone', 'America/Denver', 30, 72, 'clear')
    `);
    await fails(
      t.db.execute(sql`
        insert into app.interviews
          (id, org_id, listing_id, application_id, thread_id, organizer_user_id, status, format,
           timezone, duration_minutes, expiry_hours, scan_state)
        values (${newId()}, ${base.orgId}, ${base.listingId}, ${base.applicationId}, ${newId()},
          ${base.organizer}, 'scheduled', 'phone', 'America/Denver', 30, 72, 'clear')
      `),
      /duplicate key|unique/,
    );
    await t.db.execute(sql`
      insert into app.interviews
        (id, org_id, listing_id, application_id, thread_id, organizer_user_id, status, format,
         timezone, duration_minutes, expiry_hours, scan_state)
      values (${newId()}, ${orgId}, ${newId()}, ${applicationId}, ${newId()},
        ${userId}, 'completed', 'phone', 'America/Denver', 30, 48, 'clear')
    `);
    await fails(
      t.db.execute(sql`
        insert into app.interviews
          (id, org_id, listing_id, application_id, thread_id, organizer_user_id, status, format,
           timezone, duration_minutes, expiry_hours, scan_state)
        values (${newId()}, ${orgId}, ${newId()}, ${newId()}, ${newId()},
          ${userId}, 'invited', 'phone', 'America/Denver', 20, 72, 'clear')
      `),
      /check constraint/,
    );
    await fails(
      t.db.execute(sql`
        insert into app.interviews
          (id, org_id, listing_id, application_id, thread_id, organizer_user_id, status, format,
           timezone, duration_minutes, expiry_hours, scan_state)
        values (${newId()}, ${orgId}, ${newId()}, ${newId()}, ${newId()},
          ${userId}, 'invited', 'phone', 'America/Denver', 30, 24, 'clear')
      `),
      /check constraint/,
    );
  });

  it('allows one sent offer per application', async () => {
    const applicationId = newId();
    await t.db.execute(sql`
      insert into app.offers
        (id, org_id, listing_id, application_id, thread_id, created_by, status, position,
         start_date, pay_amount_cents, pay_unit, prior_status, scan_state)
      values (${newId()}, ${orgId}, ${newId()}, ${applicationId}, ${newId()}, ${userId},
        'sent', 'Deckhand', '2027-06-01', 2000, 'hour', 'interviewing', 'clear')
    `);
    await fails(
      t.db.execute(sql`
        insert into app.offers
          (id, org_id, listing_id, application_id, thread_id, created_by, status, position,
           start_date, pay_amount_cents, pay_unit, prior_status, scan_state)
        values (${newId()}, ${orgId}, ${newId()}, ${applicationId}, ${newId()}, ${userId},
          'sent', 'Deckhand', '2027-06-01', 2000, 'hour', 'interviewing', 'clear')
      `),
      /duplicate key|unique/,
    );
    await t.db.execute(sql`
      insert into app.offers
        (id, org_id, listing_id, application_id, thread_id, created_by, status, position,
         start_date, pay_amount_cents, pay_unit, prior_status, scan_state)
      values (${newId()}, ${orgId}, ${newId()}, ${applicationId}, ${newId()}, ${userId},
        'declined', 'Deckhand', '2027-06-01', 2000, 'hour', 'interviewing', 'clear')
    `);
  });

  it('limits message bodies and attachments, and one client id', async () => {
    const threadId = newId();
    const listingId = newId();
    await t.db.execute(sql`
      insert into app.threads (id, org_id, listing_id, seeker_user_id)
      values (${threadId}, ${orgId}, ${listingId}, ${userId})
    `);
    const six = `{${Array.from({ length: 6 }, () => newId()).join(',')}}`;
    await fails(
      t.db.execute(sql`
        insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, attachment_media_ids)
        values (${newId()}, ${threadId}, 'seeker', ${userId}, 'text', ${six}::uuid[])
      `),
      /check constraint/,
    );
    await fails(
      t.db.execute(sql`
        insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, body)
        values (${newId()}, ${threadId}, 'seeker', ${userId}, 'text', ${'a'.repeat(4001)})
      `),
      /check constraint/,
    );
    await t.db.execute(sql`
      insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, body, client_id)
      values (${newId()}, ${threadId}, 'seeker', ${userId}, 'text', ${'😀'.repeat(4000)}, 'c1')
    `);
    await fails(
      t.db.execute(sql`
        insert into app.messages (id, thread_id, sender_type, sender_user_id, kind, body, client_id)
        values (${newId()}, ${threadId}, 'seeker', ${userId}, 'text', 'again', 'c1')
      `),
      /duplicate key|unique/,
    );
    await fails(
      t.db.execute(sql`
        insert into app.threads (id, org_id, listing_id, seeker_user_id)
        values (${newId()}, ${orgId}, ${listingId}, ${userId})
      `),
      /duplicate key|unique/,
    );
  });

  it('allows one not-selected reply per org and many ordinary replies', async () => {
    await t.db.execute(sql`
      insert into app.saved_replies (id, org_id, kind, title, body)
      values (${newId()}, ${orgId}, 'not_selected', 'Pass', 'Thank you')
    `);
    await fails(
      t.db.execute(sql`
        insert into app.saved_replies (id, org_id, kind, title, body)
        values (${newId()}, ${orgId}, 'not_selected', 'Pass 2', 'Thank you again')
      `),
      /duplicate key|unique/,
    );
    await t.db.execute(sql`
      insert into app.saved_replies (id, org_id, kind, title, body)
      values (${newId()}, ${orgId}, 'reply', 'Hello', 'Hi'),
             (${newId()}, ${orgId}, 'reply', 'Thanks', 'Thanks')
    `);
  });
});
