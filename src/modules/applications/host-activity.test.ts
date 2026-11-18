// A new host opening applications (legal review 7.3): each open of a person counts against the
// daily profile-view cap, and each application opened queues the silent-host check, which opens
// one fraud item for a host in its first 30 days that has opened SILENT_HOST_OPENED applications
// and answered none.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/v1/host/applications/[id]/route';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { runWorker } from '@/modules/jobs';
import { NEW_HOST_DAILY_CAP, consumeNewHostDaily } from '@/modules/ratelimit';
import { SILENT_HOST_OPENED } from '@/modules/verification';
import { resetSp2 } from '@tests/fakes/sp4/sp2';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { getHostApplication } from './host';
import { SILENT_HOST_TOPIC, checkSilentHost, silentHostHandlers } from './host-activity';
import { setStatus } from './status';
import { submitApplication } from './submit';
import {
  auditActions,
  deckhand,
  input,
  rejection,
  resetMocks,
  seedWorld,
  type World,
} from './test-fixtures';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  ...(await import('./test-fixtures')).profilesMock(),
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('./test-fixtures')).safetyMock(),
}));
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));

const DAY_MS = 86_400_000;
const t = setupRouteDb();
let w: World;
let id: string;

beforeEach(async () => {
  resetSp2();
  resetMocks();
  w = await seedWorld(t.db);
  id = (await submitApplication(t.db, w.seeker.id, input(deckhand(w)))).application.applicationId;
});

const checks = (orgId: string) =>
  queryRows<{ dedupeKey: string | null }>(
    t.db,
    sql`select dedupe_key as "dedupeKey" from app.outbox
      where topic = ${SILENT_HOST_TOPIC} and payload->>'orgId' = ${orgId}`,
  );

const silentItems = (orgId: string) =>
  queryRows<{ reason: string; queue: string }>(
    t.db,
    sql`select reason, queue from app.review_items
      where subject_type = 'business_verification' and subject_id = ${orgId}
        and status in ('open', 'assigned', 'escalated')`,
  );

async function ageOrg(orgId: string, days: number): Promise<void> {
  await t.db.execute(
    sql`update app.organizations set created_at = ${new Date(Date.now() - days * DAY_MS)}
      where id = ${orgId}`,
  );
}

/** `n` distinct applications of the org opened by `actorId`, as the audit log records them. */
async function opened(orgId: string, actorId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await record(t.db, {
      actorType: 'user',
      actorId,
      orgId,
      action: i % 2 === 0 ? 'applications.snapshot_viewed' : 'applications.resume_downloaded',
      subjectType: 'application',
      subjectId: newId(),
    });
  }
}

describe('opening an application', () => {
  it('queues one silent-host check per application a new host opens', async () => {
    await getHostApplication(t.db, w.owner, id);
    await getHostApplication(t.db, w.admin, id);
    expect(await checks(w.orgId)).toEqual([{ dedupeKey: `silent-host:${w.orgId}:${id}` }]);
  });

  it('queues no check for a host past its first 30 days', async () => {
    await ageOrg(w.orgId, 31);
    await getHostApplication(t.db, w.owner, id);
    expect(await checks(w.orgId)).toEqual([]);
  });

  it("refuses a new host over today's profile views with 429, and reads and audits nothing", async () => {
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await consumeNewHostDaily(t.db, w.orgId, 'profile_views', new Date());
    }
    asHost(w.owner);
    const res = await call(GET, request('GET', `/api/v1/host/applications/${id}`), { id });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: { code: 'rate_limited', details: { reason: 'new_host_daily_cap' } },
    });
    expect(await auditActions(t.db, 'applications.snapshot_viewed')).not.toContainEqual(
      expect.objectContaining({ orgId: w.orgId }),
    );
    const err = await rejection(getHostApplication(t.db, w.owner, id));
    expect(err.status).toBe(429);
  });
});

describe('the silent-host check', () => {
  it('opens one fraud item once a new host has opened enough applications and answered none', async () => {
    await opened(w.orgId, w.owner.user.id, SILENT_HOST_OPENED - 1);
    await checkSilentHost(t.db, w.orgId);
    expect(await silentItems(w.orgId)).toEqual([]);

    await opened(w.orgId, w.recruiter.user.id, 1);
    await checkSilentHost(t.db, w.orgId);
    await checkSilentHost(t.db, w.orgId);
    expect(await silentItems(w.orgId)).toEqual([{ queue: 'fraud', reason: 'silent_host' }]);
  });

  it('counts an application opened twice once', async () => {
    const subjectId = newId();
    for (let i = 0; i < SILENT_HOST_OPENED; i++) {
      await record(t.db, {
        actorType: 'user',
        actorId: w.owner.user.id,
        orgId: w.orgId,
        action: 'applications.snapshot_viewed',
        subjectType: 'application',
        subjectId,
      });
    }
    await checkSilentHost(t.db, w.orgId);
    expect(await silentItems(w.orgId)).toEqual([]);
  });

  it('stays quiet for a host that answered an applicant', async () => {
    await setStatus(t.db, {
      applicationId: id,
      from: ['new'],
      to: 'shortlisted',
      actor: { type: 'host', userId: w.owner.user.id, orgId: w.orgId },
    });
    await opened(w.orgId, w.owner.user.id, SILENT_HOST_OPENED + 5);
    await checkSilentHost(t.db, w.orgId);
    expect(await silentItems(w.orgId)).toEqual([]);
  });

  it('stays quiet for a host past its first 30 days', async () => {
    await ageOrg(w.orgId, 30);
    await opened(w.orgId, w.owner.user.id, SILENT_HOST_OPENED + 5);
    await checkSilentHost(t.db, w.orgId);
    expect(await silentItems(w.orgId)).toEqual([]);
  });

  it('runs as the queued job', async () => {
    await opened(w.orgId, w.owner.user.id, SILENT_HOST_OPENED - 1);
    await getHostApplication(t.db, w.owner, id);
    const handler = silentHostHandlers[SILENT_HOST_TOPIC];
    if (!handler) throw new Error('no silent-host handler');
    await runWorker(t.db, { handlers: { [SILENT_HOST_TOPIC]: handler } });
    expect(await silentItems(w.orgId)).toEqual([{ queue: 'fraud', reason: 'silent_host' }]);
  });
});
