// Who may report a thread or a message in it (issue 209): the thread's seeker, a member of the
// host org reporting for that org, or an operator. Anyone else gets the `not_found` an unknown id
// gets, so a report never confirms that a thread or a message exists. The reports go through the
// real safety module, so the registration and `report` are tested together.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { report, type Reporter } from '@/modules/safety';
// The operator seed is a trust test helper and is not on the trust public index.
// eslint-disable-next-line no-restricted-imports
import { addOperator } from '@/modules/trust/test-fixtures';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import './notification-types';
import { sendMessage } from './send';
import {
  seedHostOrg,
  seedMember,
  seedSeeker,
  seedThread,
  seekerViewer,
  type SeededThread,
} from './test-fixtures';

type SubjectType = 'thread' | 'message';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await import('./register');
});

afterAll(async () => {
  await t.close();
});

/** A thread and the subject of `type` in it: the thread itself, or a message the seeker sent. */
async function seedSubject(type: SubjectType): Promise<SeededThread & { subjectId: string }> {
  const seeded = await seedThread(t.db);
  if (type === 'thread') return { ...seeded, subjectId: seeded.threadId };
  const sent = await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
    clientId: newId(),
    body: 'Is the housing shared?',
  });
  return { ...seeded, subjectId: sent.message.id };
}

function file(reporter: Reporter, subjectType: SubjectType, subjectId: string) {
  return report(t.db, reporter, { subjectType, subjectId, reason: 'harassment' });
}

async function count(q: ReturnType<typeof sql>): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, q);
  return row?.n ?? 0;
}

/** The report's row and its review item: who filed it, for which org, on which trust subject. */
async function filed(reportId: string) {
  const [row] = await queryRows<{
    reporter_user_id: string;
    reporter_org_id: string | null;
    subject_id: string;
    trust_subject_type: string;
  }>(
    t.db,
    sql`select r.reporter_user_id, r.reporter_org_id, r.subject_id,
          ri.subject_type as trust_subject_type
        from app.reports r join app.review_items ri on ri.id = r.review_item_id
        where r.id = ${reportId}`,
  );
  return row;
}

/** The error `report` throws, so two refusals can be compared field by field. */
async function refusal(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  const err = await promise.then(
    () => {
      throw new Error('expected the report to be refused');
    },
    (e: unknown) => e as Record<string, unknown>,
  );
  return {
    name: err.name,
    code: err.code,
    status: err.status,
    message: err.message,
    details: err.details,
  };
}

describe.each(['thread', 'message'] as const)('reporting a %s', (type) => {
  it('lets the seeker in the thread report it', async () => {
    const s = await seedSubject(type);
    const r = await file({ userId: s.seekerId }, type, s.subjectId);
    expect(r.created).toBe(true);
    expect(await filed(r.reportId)).toEqual({
      reporter_user_id: s.seekerId,
      reporter_org_id: null,
      subject_id: s.subjectId,
      trust_subject_type: type,
    });
  });

  it('lets a member of the host org report it for that org', async () => {
    const s = await seedSubject(type);
    const recruiter = await seedMember(t.db, s.orgId, 'recruiter');
    const byOwner = await file({ userId: s.ownerId, orgId: s.orgId }, type, s.subjectId);
    const byRecruiter = await file({ userId: recruiter.userId, orgId: s.orgId }, type, s.subjectId);
    expect(byOwner.created).toBe(true);
    expect(byRecruiter.created).toBe(true);
    expect(await filed(byRecruiter.reportId)).toMatchObject({
      reporter_user_id: recruiter.userId,
      reporter_org_id: s.orgId,
      trust_subject_type: type,
    });
  });

  it('lets an operator report it', async () => {
    const s = await seedSubject(type);
    const operatorId = await addOperator(t.db, { queues: ['moderation'] });
    const r = await file({ userId: operatorId }, type, s.subjectId);
    expect(r.created).toBe(true);
    expect(await filed(r.reportId)).toMatchObject({
      reporter_user_id: operatorId,
      subject_id: s.subjectId,
      trust_subject_type: type,
    });
  });

  it('refuses a seeker outside the thread exactly as it refuses an unknown id', async () => {
    const s = await seedSubject(type);
    const outsider = await seedSeeker(t.db);
    const refused = await refusal(file({ userId: outsider.userId }, type, s.subjectId));
    const unknown = await refusal(file({ userId: outsider.userId }, type, newId()));
    expect(refused).toMatchObject({ code: 'not_found' });
    expect(refused).toEqual(unknown);
    expect(
      await count(
        sql`select count(*)::int as n from app.reports where reporter_user_id = ${outsider.userId}`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select count(*)::int as n from app.review_items where subject_id = ${s.subjectId}`,
      ),
    ).toBe(0);
  });

  it("refuses another org's member, even one who names the thread's org", async () => {
    const s = await seedSubject(type);
    const other = await seedHostOrg(t.db, { name: 'Lakeside Outfitters' });
    await expect(
      file({ userId: other.owner.userId, orgId: other.orgId }, type, s.subjectId),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      file({ userId: other.owner.userId, orgId: s.orgId }, type, s.subjectId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a member of the host org who reports for another org', async () => {
    const s = await seedSubject(type);
    const other = await seedHostOrg(t.db, { name: 'Lakeside Outfitters' });
    await expect(
      file({ userId: s.ownerId, orgId: other.orgId }, type, s.subjectId),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(file({ userId: s.ownerId }, type, s.subjectId)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
