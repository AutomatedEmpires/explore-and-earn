import { sql } from 'drizzle-orm';
import { createElement } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { setSetting } from '@/modules/settings';
import { defineType, jobHandlers, notify, sendDirectEmail, sendEmailNow, sendEmailTo, suppressEmail } from '../index';
import { renderEmail, stubOutbox } from './send';
import AccountStatus from './templates/AccountStatus';
import LegalUpdate from './templates/LegalUpdate';
import OperatorDigest from './templates/OperatorDigest';
import PrivacyDeletion from './templates/PrivacyDeletion';
import PrivacyExportReady from './templates/PrivacyExportReady';
import SupportReply, { SUPPORT_REPLY_AUTOMATIC_LINE } from './templates/SupportReply';

const ADDRESS = 'PO Box 1, Moab, UT 84532';
const REPLY_TO = 't-1-abcdefghijkl@reply.localhost';

defineType({
  type: 'sp8.reply_to_probe',
  category: 'account',
  title: () => 'Reply probe',
  body: () => 'A reply-to probe',
  email: { template: 'SystemTest', replyTo: () => REPLY_TO },
});

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  stubOutbox.length = 0;
  await t.db.execute(
    sql`truncate app.notifications, app.notification_preferences, app.email_suppressions,
      app.notification_batches, app.outbox, app.settings, app.users cascade`,
  );
  await setSetting(t.db, 'business.mailing_address', ADDRESS, { operatorId: newId() });
});

const notice = {
  heading: 'Your download is ready',
  lines: ['It stays available for seven days.'],
  button: null,
};

async function rendered(node: ReturnType<typeof createElement>): Promise<{ html: string; text: string }> {
  return renderEmail(node);
}

describe('SP8 email templates', () => {
  it('renders the mailing address in each template', async () => {
    const footer = { mailingAddress: ADDRESS };
    const templates = [
      createElement(PrivacyExportReady, { ...notice, footer }),
      createElement(PrivacyDeletion, { ...notice, footer }),
      createElement(LegalUpdate, { ...notice, footer }),
      createElement(AccountStatus, { ...notice, footer }),
      createElement(SupportReply, {
        ticketNumber: 12,
        subject: 'Cannot sign in',
        replyBody: 'Try the reset link.',
        threadUrl: null,
        automatic: false,
        footer,
      }),
      createElement(OperatorDigest, {
        dateLabel: 'Nov 17',
        rows: [{ label: 'Open items', value: '3' }],
        consoleUrl: 'http://localhost:3000/admin',
        footer,
      }),
    ];
    for (const template of templates) {
      const { html, text } = await rendered(template);
      expect(html).toContain(ADDRESS);
      expect(text).toContain(ADDRESS);
    }
  });

  it('adds the automatic closing line only when SupportReply says so', async () => {
    const footer = { mailingAddress: ADDRESS };
    const automatic = await rendered(
      createElement(SupportReply, {
        ticketNumber: 4,
        subject: 'Hours',
        replyBody: 'We are open daily.',
        threadUrl: null,
        automatic: true,
        footer,
      }),
    );
    const personal = await rendered(
      createElement(SupportReply, {
        ticketNumber: 4,
        subject: 'Hours',
        replyBody: 'We are open daily.',
        threadUrl: null,
        automatic: false,
        footer,
      }),
    );
    const shown = (html: string) => html.replaceAll('&#x27;', "'");
    expect(shown(automatic.html)).toContain(SUPPORT_REPLY_AUTOMATIC_LINE);
    expect(automatic.text).toContain(SUPPORT_REPLY_AUTOMATIC_LINE);
    expect(shown(personal.html)).not.toContain(SUPPORT_REPLY_AUTOMATIC_LINE);
    expect(personal.text).not.toContain(SUPPORT_REPLY_AUTOMATIC_LINE);
  });
});

describe('sendDirectEmail', () => {
  const reply = {
    ticketNumber: 8,
    subject: 'Payout timing',
    replyBody: 'Payouts leave on Fridays.',
    threadUrl: 'http://localhost:3000/help/tickets/t8',
    automatic: false,
  };

  it('queues one account email, lowercases the address, and keeps Reply-To', async () => {
    await sendDirectEmail(t.db, {
      to: 'Guest@Example.com',
      template: 'SupportReply',
      data: reply,
      replyTo: REPLY_TO,
      dedupeKey: 'ticket-8',
    });
    await sendDirectEmail(t.db, {
      to: 'Guest@Example.com',
      template: 'SupportReply',
      data: reply,
      replyTo: REPLY_TO,
      dedupeKey: 'ticket-8',
    });

    const jobs = await queryRows<{ payload: { category: string; to: string } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'notifications.email_direct'`,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload).toMatchObject({ category: 'account', to: 'guest@example.com' });

    await runWorker(t.db, { handlers: jobHandlers });
    expect(stubOutbox).toHaveLength(1);
    const [message] = stubOutbox;
    expect(message?.to).toBe('guest@example.com');
    expect(message?.replyTo).toBe(REPLY_TO);
    expect(message?.subject).toBe('Re: [#8] Payout timing');
    expect(message?.headers).not.toHaveProperty('List-Unsubscribe');
    expect(message?.html).toContain(ADDRESS);
  });

  it('enqueues nothing for a suppressed address', async () => {
    await suppressEmail(t.db, 'guest@example.com', 'bounce');
    await sendDirectEmail(t.db, {
      to: 'Guest@Example.com',
      template: 'SupportReply',
      data: reply,
      dedupeKey: 'ticket-9',
    });
    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('still sends an SP2 direct email that has no replyTo', async () => {
    await sendEmailTo(t.db, {
      to: 'owner@kettle.com',
      template: 'HostNotice',
      data: {
        heading: 'Your listing is live',
        lines: ['Seekers can apply today.'],
        button: { label: 'View listing', href: 'http://localhost:3000/host/listings/l1' },
      },
      category: 'jobs',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(stubOutbox).toHaveLength(1);
    expect(stubOutbox[0]?.replyTo).toBeUndefined();
    expect(stubOutbox[0]?.subject).toBe('Your listing is live');
  });
});

describe('sendEmailNow idempotency', () => {
  it('sends one message when the same idempotency key is used twice', async () => {
    const input = {
      to: 'ops@example.com',
      template: 'AccountStatus' as const,
      data: notice,
      category: 'account' as const,
      idempotencyKey: 'k1',
    };
    await sendEmailNow(t.db, input);
    await sendEmailNow(t.db, input);
    expect(stubOutbox).toHaveLength(1);
  });
});

describe('notification replyTo', () => {
  it('puts the type replyTo on the sent message', async () => {
    const userId = newId();
    await t.db.execute(
      sql`insert into app.users (id, clerk_user_id, email) values (${userId}, ${`user_${userId}`}, 'maya@example.com')`,
    );
    await notify(t.db, userId, 'sp8.reply_to_probe', {});
    await runWorker(t.db, { handlers: jobHandlers });
    expect(stubOutbox).toHaveLength(1);
    expect(stubOutbox[0]?.replyTo).toBe(REPLY_TO);
  });
});
