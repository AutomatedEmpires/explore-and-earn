// SP4's lines in the shared touchpoints (SP4 plan Task 5): job handlers, schedules, the event
// subscriber, the counts provider, and every SP4 route documented in /api/v1/openapi.json.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { getCounts } from '@/server/counts';
import { eventSubscribers } from '@/server/event-subscribers';
import { handlers } from '@/server/job-handlers';
import { buildOpenApi } from '@/server/openapi';
import { schedules } from '@/server/schedules';
import { createTestDb, type TestDb } from '@tests/helpers/db';
// Importing the document route imports every documented route, so each registers itself.
import '@/app/api/v1/openapi.json/route';

/** The route table in the SP4 plan's File Structure: 37 method and path pairs. */
const SP4_ROUTES = [
  ['GET', '/api/v1/me/profile'],
  ['PATCH', '/api/v1/me/profile'],
  ['PUT', '/api/v1/me/availability'],
  ['POST', '/api/v1/me/availability/confirm'],
  ['POST', '/api/v1/me/profile/{section}'],
  ['PATCH', '/api/v1/me/profile/{section}/{id}'],
  ['DELETE', '/api/v1/me/profile/{section}/{id}'],
  ['PUT', '/api/v1/me/profile/{section}/order'],
  ['PUT', '/api/v1/me/profile/skills'],
  ['GET', '/api/v1/me/resume.pdf'],
  ['GET', '/api/v1/me/applications/{id}/resume.pdf'],
  ['GET', '/api/v1/host/applications/{id}/resume.pdf'],
  ['POST', '/api/v1/me/resume-imports'],
  ['GET', '/api/v1/me/resume-imports/{id}'],
  ['DELETE', '/api/v1/me/resume-imports/{id}'],
  ['POST', '/api/v1/me/resume-imports/{id}/merge'],
  ['DELETE', '/api/v1/me/ai-consent'],
  ['POST', '/api/v1/me/writing-help'],
  ['GET', '/api/v1/apply/{listingId}/context'],
  ['POST', '/api/v1/applications'],
  ['GET', '/api/v1/me/applications'],
  ['GET', '/api/v1/me/applications/{id}'],
  ['POST', '/api/v1/me/applications/{id}/withdraw'],
  ['PUT', '/api/v1/me/applications/{id}/additional-step'],
  ['GET', '/api/v1/host/applications/{id}'],
  ['POST', '/api/v1/reports'],
  ['GET', '/api/v1/me/blocks'],
  ['PUT', '/api/v1/me/blocks'],
  ['DELETE', '/api/v1/me/blocks/{type}/{id}'],
  ['GET', '/api/v1/me/mutes'],
  ['PUT', '/api/v1/me/mutes/{orgId}'],
  ['DELETE', '/api/v1/me/mutes/{orgId}'],
  ['GET', '/api/v1/host/blocks'],
  ['PUT', '/api/v1/host/blocks'],
  ['DELETE', '/api/v1/host/blocks/{blockId}'],
  ['GET', '/api/v1/me/notification-preferences'],
  ['PUT', '/api/v1/me/notification-preferences'],
] as const;

/** The auth each route uses (plan route table): billing members and guests never reach SP4. */
const AUTH: Record<string, string> = {
  'POST /api/v1/reports': 'user',
  'GET /api/v1/me/notification-preferences': 'user',
  'PUT /api/v1/me/notification-preferences': 'user',
  'GET /api/v1/host/applications/{id}/resume.pdf': 'host',
  'GET /api/v1/host/applications/{id}': 'host',
  'GET /api/v1/host/blocks': 'host',
  'PUT /api/v1/host/blocks': 'host',
  'DELETE /api/v1/host/blocks/{blockId}': 'host',
};

describe('job handlers', () => {
  it('has the SP4 topics', () => {
    for (const topic of [
      'profiles.import_extract',
      'profiles.import_expire',
      'profiles.availability_sweep',
      'applications.listing_event',
    ]) {
      expect(typeof handlers[topic], topic).toBe('function');
    }
  });
});

describe('schedules', () => {
  it('runs the SP4 crons (UTC)', () => {
    expect(schedules).toEqual(
      expect.arrayContaining([
        { topic: 'profiles.import_expire', cron: '15 * * * *' },
        { topic: 'profiles.availability_sweep', cron: '0 15 * * *' },
      ]),
    );
  });
});

describe('event subscribers', () => {
  it('records an apply listing event for every submitted application', () => {
    expect(eventSubscribers['application.submitted']).toContain('applications.listing_event');
  });

  it('subscribes no topic without a handler', () => {
    for (const event of [
      'application.submitted',
      'application.withdrawn',
      'application.status_changed',
      'application.additional_step_changed',
    ] as const) {
      for (const topic of eventSubscribers[event]) {
        expect(typeof handlers[topic], `${event} -> ${topic}`).toBe('function');
      }
    }
  });
});

describe('openapi', () => {
  it.each(SP4_ROUTES)('documents %s %s', (method, path) => {
    const op = buildOpenApi().paths[path]?.[method.toLowerCase() as Lowercase<typeof method>];
    expect(op, `${method} ${path}`).toBeDefined();
    expect(op?.['x-auth']).toBe(AUTH[`${method} ${path}`] ?? 'seeker');
  });

  it('lists 37 pairs', () => {
    expect(SP4_ROUTES).toHaveLength(37);
  });
});

describe('getCounts', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it('has no profile dot for a user without a profile row', async () => {
    const id = newId();
    await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${id}, ${id})`);
    expect(await getCounts(t.db, id)).toEqual({ inbox: 0, notifications: 0, profileDot: false });
  });
});
