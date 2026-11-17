import { createElement } from 'react';
import { render } from '@react-email/components';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { setSetting } from '@/modules/settings';
import { defineType, jobHandlers, markReadByData, notify } from './index';
import { flushBatches } from './batches';
import { resendEmailProvider, sendEmailJob, stubOutbox } from './email/send';
import HiringUpdate from './email/templates/HiringUpdate';
import type { FooterProps } from './email/templates/Layout';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

defineType({
  type: 'messages.new',
  category: 'messages',
  title: () => 'New message',
  body: () => 'Open the conversation to read it.',
  email: { template: 'SystemTest' },
});

defineType({
  type: 'hiring.offer_received',
  category: 'applications',
  title: () => 'Offer',
  body: () => 'Open the offer.',
  email: { template: 'SystemTest' },
});

defineType({
  type: 'test.ics',
  category: 'applications',
  title: () => 'Interview scheduled',
  body: () => 'Open the conversation to read it.',
  email: {
    template: 'HiringUpdate',
    attachments: async () => [
      {
        filename: 'interview.ics',
        contentType: 'text/calendar; method=REQUEST',
        content: 'BEGIN:VCALENDAR',
      },
    ],
  },
});

defineType({
  type: 'test.ics_throws',
  category: 'applications',
  title: () => 'Interview scheduled',
  body: () => 'Open the conversation to read it.',
  email: {
    template: 'HiringUpdate',
    attachments: async () => {
      throw new Error('ics unavailable');
    },
  },
});

defineType({
  type: 'test.digest_action',
  category: 'messages',
  title: () => 'New message from Kettle Ridge',
  body: () => 'Open the conversation to read it.',
  url: () => 'https://x.test/inbox/t1',
  email: {
    template: 'Digest',
    batch: { key: 'digest-action', delayMinutes: 15 },
    digestAction: 'Reply in app',
  },
});

const ADDRESS = '1 Harbor Road, Juneau, AK 99801';
const minutes = (n: number) => n * 60_000;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  stubOutbox.length = 0;
  sendMock.mockReset();
  await t.db.execute(
    sql`truncate app.notifications, app.notification_preferences, app.push_subscriptions,
      app.email_suppressions, app.notification_batches, app.outbox, app.settings, app.users cascade`,
  );
  await setSetting(t.db, 'business.mailing_address', ADDRESS, { operatorId: newId() });
});

async function newUser(email: string | null = 'maya@example.com'): Promise<string> {
  const id = newId();
  await t.db.execute(
    sql`insert into app.users (id, clerk_user_id, email) values (${id}, ${`user_${id}`}, ${email})`,
  );
  return id;
}

async function unreadRows(userId: string) {
  return queryRows<{ type: string; thread_id: string | null }>(
    t.db,
    sql`select type, data->>'threadId' as thread_id
        from app.notifications
        where user_id = ${userId} and read_at is null
        order by type, thread_id`,
  );
}

describe('markReadByData', () => {
  it('marks only the matching unread rows and returns how many', async () => {
    const userId = await newUser();
    const other = await newUser('alex@example.com');
    await notify(t.db, userId, 'messages.new', { threadId: 't1' });
    await notify(t.db, userId, 'messages.new', { threadId: 't1' });
    await notify(t.db, userId, 'messages.new', { threadId: 't2' });
    await notify(t.db, userId, 'hiring.offer_received', { threadId: 't1' });
    await notify(t.db, other, 'messages.new', { threadId: 't1' });

    const marked = await markReadByData(t.db, userId, {
      types: ['messages.new'],
      key: 'threadId',
      value: 't1',
    });

    expect(marked).toBe(2);
    expect(await unreadRows(userId)).toEqual([
      { type: 'hiring.offer_received', thread_id: 't1' },
      { type: 'messages.new', thread_id: 't2' },
    ]);
    expect(await unreadRows(other)).toEqual([{ type: 'messages.new', thread_id: 't1' }]);
  });
});

describe('email attachments', () => {
  it('puts the type attachments on the stub outbox message', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.ics', {});
    await runWorker(t.db, { handlers: jobHandlers });
    expect(stubOutbox[0]?.attachments?.[0]?.filename).toBe('interview.ics');
  });

  it('fails the email job when attachments throws and sends nothing', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.ics_throws', {});
    const [row] = await queryRows<{ id: string }>(
      t.db,
      sql`select id from app.notifications where user_id = ${userId}`,
    );
    await expect(sendEmailJob(t.db, { notificationId: row?.id })).rejects.toThrow('ics unavailable');
    expect(stubOutbox).toHaveLength(0);
  });

  it('sends base64 attachment content through the Resend adapter', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const provider = resendEmailProvider('re_test', 'Explore&Earn <notify@send.exploreandearn.com>');
    await provider.send({
      to: 'maya@example.com',
      subject: 'Interview',
      html: '<p>T</p>',
      text: 'T',
      headers: {},
      attachments: [
        {
          filename: 'interview.ics',
          contentType: 'text/calendar; method=REQUEST',
          content: 'BEGIN:VCALENDAR',
        },
      ],
    });
    const payload = sendMock.mock.calls[0]?.[0] as {
      attachments: { content: string; filename: string; contentType: string }[];
    };
    expect(payload.attachments[0]).toEqual({
      filename: 'interview.ics',
      content: Buffer.from('BEGIN:VCALENDAR').toString('base64'),
      contentType: 'text/calendar; method=REQUEST',
    });
  });
});

describe('digest actions and HiringUpdate', () => {
  it('renders a digest action link to the notification url', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.digest_action', {});
    expect(await flushBatches(t.db, new Date(Date.now() + minutes(16)))).toEqual({
      queued: 1,
      skipped: 0,
    });
    await runWorker(t.db, { handlers: jobHandlers });
    const html = stubOutbox[0]?.html ?? '';
    expect(html).toContain('Reply in app');
    expect(html).toContain('https://x.test/inbox/t1');
  });

  it('renders HiringUpdate title, body and link', async () => {
    const footer: FooterProps = {
      mailingAddress: ADDRESS,
      manageUrl: 'https://x.test/manage',
      unsubscribeUrl: 'https://x.test/unsub',
    };
    const html = await render(
      createElement(HiringUpdate, { title: 'T', body: 'B', url: 'https://x.test/a', footer }),
    );
    expect(html).toContain('T');
    expect(html).toContain('B');
    expect(html).toContain('https://x.test/a');
  });
});
