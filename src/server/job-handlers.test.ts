// The alert raised when an outbox event goes dead (spec section 5).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { logger } from '@/lib/logger';
import { newId } from '@/lib/ids';
import { EMAIL_TOPIC } from '@/modules/notifications';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { onDeadEvent } from './job-handlers';

let t: TestDb;
let owner: string;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await t.db.execute(sql`truncate app.notifications, app.operators, app.users cascade`);
  owner = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${owner}, ${`user_${owner}`}, 'owner@ops.test', 'Owner', 'operator')
  `);
  await t.db.execute(sql`insert into app.operators (user_id, role) values (${owner}, 'owner')`);
});

const alerts = () =>
  queryRows<{ user_id: string; type: string; data: { topic?: string; eventId?: string } }>(
    t.db,
    sql`select user_id, type, data from app.notifications where type = 'operator.alert'`,
  );

describe('onDeadEvent', () => {
  it('alerts every Owner, naming the topic and event', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const eventId = newId();
    await onDeadEvent(t.db, { eventId, topic: 'media.scan', attempts: 8, error: 'boom' });

    const sent = await alerts();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      user_id: owner,
      data: { topic: 'media.scan', eventId, kind: 'job_dead' },
    });
    const audited = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.audit_events where action = 'trust.alert'`,
    );
    expect(audited[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('leaves a dead notification delivery to Sentry, so an alert cannot feed on itself', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await onDeadEvent(t.db, { eventId: newId(), topic: EMAIL_TOPIC, attempts: 8, error: 'down' });
    expect(await alerts()).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('deliver'),
      expect.objectContaining({ topic: EMAIL_TOPIC }),
    );
  });
});
