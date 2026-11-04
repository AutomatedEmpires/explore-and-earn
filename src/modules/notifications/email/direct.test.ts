import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { runWorker } from '@/modules/jobs';
import {
  EMAIL_DIRECT_TOPIC,
  jobHandlers,
  sendEmailNow,
  sendEmailTo,
  suppressEmail,
} from '../index';
import { stubEmailProvider, stubOutbox } from './send';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  stubOutbox.length = 0;
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.email_suppressions`);
});

const invite = {
  orgName: 'Kettle Ridge Lodge',
  inviterName: 'Sam Rivera',
  role: 'Recruiter',
  acceptUrl: 'http://localhost:3000/join/tok_abc123',
  expiresAt: '2026-11-10T17:00:00.000Z',
};

const count = async (table: 'outbox' | 'notifications') =>
  (
    await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from ${sql.raw(`app.${table}`)}`,
    )
  )[0]?.n;

describe('sendEmailNow', () => {
  it('sends a team invitation at once and stores nothing', async () => {
    const result = await sendEmailNow(t.db, {
      to: 'Maya@Kettle.com',
      template: 'TeamInvite',
      data: invite,
      category: 'account',
    });

    expect(result).toBe('sent');
    expect(stubOutbox).toHaveLength(1);
    const [m] = stubOutbox;
    expect(m?.to).toBe('maya@kettle.com');
    expect(m?.subject).toBe('Join Kettle Ridge Lodge on Explore&Earn');
    expect(m?.html).toContain('http://localhost:3000/join/tok_abc123');
    expect(m?.text).toContain('Sam Rivera');
    expect(m?.headers).not.toHaveProperty('List-Unsubscribe');
    expect(await count('outbox')).toBe(0);
    expect(await count('notifications')).toBe(0);
  });

  it('returns suppressed for a suppressed address and sends nothing', async () => {
    await suppressEmail(t.db, 'maya@kettle.com', 'bounce');
    const result = await sendEmailNow(t.db, {
      to: 'maya@kettle.com',
      template: 'TeamInvite',
      data: invite,
      category: 'account',
    });
    expect(result).toBe('suppressed');
    expect(stubOutbox).toHaveLength(0);
  });

  it('refuses data that does not fit the template', async () => {
    await expect(
      sendEmailNow(t.db, {
        to: 'maya@kettle.com',
        template: 'TeamInvite',
        data: { orgName: 'Kettle Ridge Lodge' },
        category: 'account',
      }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(stubOutbox).toHaveLength(0);
  });
});

describe('sendEmailTo', () => {
  const notice = {
    heading: 'Your listing is live',
    lines: ['Lift Operator is now live on Explore&Earn.', 'Seekers can apply today.'],
    button: { label: 'View listing', href: 'http://localhost:3000/host/listings/l1' },
  };

  it('enqueues a direct email that the worker sends without List-Unsubscribe', async () => {
    await sendEmailTo(t.db, {
      to: 'owner@kettle.com',
      template: 'HostNotice',
      data: notice,
      category: 'jobs',
    });
    const jobs = await queryRows<{ topic: string }>(t.db, sql`select topic from app.outbox`);
    expect(jobs).toEqual([{ topic: EMAIL_DIRECT_TOPIC }]);
    expect(stubOutbox).toHaveLength(0);

    await runWorker(t.db, { handlers: jobHandlers });

    expect(stubOutbox).toHaveLength(1);
    const [m] = stubOutbox;
    expect(m?.to).toBe('owner@kettle.com');
    expect(m?.subject).toBe('Your listing is live');
    expect(m?.html).toContain('Seekers can apply today.');
    expect(m?.html).toContain('http://localhost:3000/host/listings/l1');
    expect(m?.headers).not.toHaveProperty('List-Unsubscribe');
  });

  it('enqueues nothing for a suppressed address', async () => {
    await suppressEmail(t.db, 'owner@kettle.com', 'complaint');
    await sendEmailTo(t.db, {
      to: 'owner@kettle.com',
      template: 'HostNotice',
      data: notice,
      category: 'jobs',
    });
    expect(await count('outbox')).toBe(0);
  });

  it('enqueues once per dedupe key', async () => {
    const input = {
      to: 'billing@kettle.com',
      template: 'BillingNotice' as const,
      data: { ...notice, heading: 'Your trial ends soon' },
      category: 'billing' as const,
      dedupeKey: 'trial-ending:org-1',
    };
    await sendEmailTo(t.db, input);
    await sendEmailTo(t.db, input);
    expect(await count('outbox')).toBe(1);
  });
});

describe('the stub provider on disk', () => {
  let dir: string;
  const saved = process.env.VITEST;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ee-emails-'));
  });

  afterEach(() => {
    process.env.VITEST = saved;
    resetEnvCache();
    rmSync(dir, { recursive: true, force: true });
  });

  const message = {
    to: 'maya@kettle.com',
    subject: 'Join Kettle Ridge Lodge on Explore&Earn',
    html: '<p>hi</p>',
    text: 'hi',
    headers: {},
  };

  it('writes no file under Vitest', async () => {
    await stubEmailProvider({ dir }).send(message);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('writes each message to <dir>/<id>.json in dev outside Vitest', async () => {
    delete process.env.VITEST;
    resetEnvCache();
    const { id } = await stubEmailProvider({ dir }).send(message);

    const files = readdirSync(dir);
    expect(files).toEqual([`${id}.json`]);
    const written = JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(written).toMatchObject({ to: 'maya@kettle.com', subject: message.subject });
    expect(typeof written.sentAt).toBe('string');
  });
});
