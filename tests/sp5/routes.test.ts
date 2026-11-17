// SP5 route contracts: every method is in the OpenAPI document, and path ids reach the handler.
import { describe, expect, it, vi } from 'vitest';
import '@/app/api/v1/openapi.json/route';
import { newId } from '@/lib/ids';
import type { CurrentUser } from '@/modules/identity';
import { buildOpenApi } from '@/server/openapi';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';

const { recorded, real } = vi.hoisted(() => ({
  recorded: [] as {
    auth?: string;
    input?: unknown;
    openapi?: { method: string; path: string; summary: string };
    handler: (ctx: { input: unknown }) => Promise<unknown>;
  }[],
  real: { apiRoute: undefined as typeof import('@/server/api').apiRoute | undefined },
}));

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/server/api', async (orig) => {
  const actual = await orig<typeof import('@/server/api')>();
  real.apiRoute = actual.apiRoute;
  return {
    ...actual,
    apiRoute(opts: Parameters<typeof actual.apiRoute>[0]) {
      recorded.push(opts as (typeof recorded)[number]);
      return actual.apiRoute(opts);
    },
  };
});

setupRouteDb();

const SP5: [method: string, path: string][] = [
  ['GET', '/api/v1/host/home'],
  ['GET', '/api/v1/host/applicants'],
  ['GET', '/api/v1/host/applicants/{applicationId}'],
  ['POST', '/api/v1/host/applicants/{applicationId}/shortlist'],
  ['POST', '/api/v1/host/applicants/{applicationId}/pass'],
  ['POST', '/api/v1/host/applicants/{applicationId}/pass/undo'],
  ['POST', '/api/v1/host/applicants/{applicationId}/hire'],
  ['POST', '/api/v1/host/applicants/{applicationId}/interviews'],
  ['POST', '/api/v1/host/applicants/{applicationId}/offers'],
  ['GET', '/api/v1/host/listings/{id}/candidates'],
  ['PUT', '/api/v1/host/candidates/{candidateId}/save'],
  ['DELETE', '/api/v1/host/candidates/{candidateId}/save'],
  ['PUT', '/api/v1/host/candidates/{candidateId}/hide'],
  ['DELETE', '/api/v1/host/candidates/{candidateId}/hide'],
  ['GET', '/api/v1/host/invites'],
  ['POST', '/api/v1/host/invites'],
  ['GET', '/api/v1/host/invites/{id}/candidate'],
  ['GET', '/api/v1/host/interviews'],
  ['POST', '/api/v1/host/interviews/{id}/propose'],
  ['POST', '/api/v1/host/interviews/{id}/cancel'],
  ['POST', '/api/v1/host/interviews/{id}/outcome'],
  ['POST', '/api/v1/host/offers/{id}/cancel'],
  ['GET', '/api/v1/host/threads'],
  ['POST', '/api/v1/host/listings/{id}/bulk-messages'],
  ['GET', '/api/v1/host/saved-replies'],
  ['POST', '/api/v1/host/saved-replies'],
  ['PATCH', '/api/v1/host/saved-replies/{id}'],
  ['DELETE', '/api/v1/host/saved-replies/{id}'],
  ['GET', '/api/v1/host/not-selected-message'],
  ['PUT', '/api/v1/host/not-selected-message'],
  ['GET', '/api/v1/host/analytics'],
  ['GET', '/api/v1/host/analytics/export.csv'],
  ['GET', '/api/v1/me/invites'],
  ['GET', '/api/v1/me/invites/{id}'],
  ['POST', '/api/v1/me/invites/{id}/respond'],
  ['POST', '/api/v1/me/invites/{id}/mute'],
  ['GET', '/api/v1/me/interviews'],
  ['POST', '/api/v1/me/interviews/{id}/pick'],
  ['POST', '/api/v1/me/interviews/{id}/request-times'],
  ['POST', '/api/v1/me/interviews/{id}/decline'],
  ['GET', '/api/v1/me/offers'],
  ['POST', '/api/v1/me/offers/{id}/accept'],
  ['POST', '/api/v1/me/offers/{id}/decline'],
  ['GET', '/api/v1/me/threads'],
  ['GET', '/api/v1/me/as-described/{id}'],
  ['POST', '/api/v1/me/as-described/{id}'],
  ['GET', '/api/v1/threads/{id}'],
  ['POST', '/api/v1/threads/{id}/messages'],
  ['POST', '/api/v1/threads/{id}/read'],
  ['GET', '/api/v1/threads/{id}/attachments/{mediaId}'],
  ['GET', '/api/v1/interviews/{id}/ics'],
  ['GET', '/api/v1/offers/{id}/letter'],
];

function authFor(path: string): 'host' | 'seeker' | 'user' {
  if (path.startsWith('/api/v1/host/')) return 'host';
  if (path.startsWith('/api/v1/me/')) return 'seeker';
  return 'user';
}

describe('SP5 routes', () => {
  it('documents all 52 operations with auth, uuid path params, and no path fields in the body', () => {
    expect(SP5).toHaveLength(52);
    const doc = buildOpenApi();
    for (const [method, path] of SP5) {
      const op = doc.paths[path]?.[method.toLowerCase() as 'get'];
      expect(op, `${method} ${path}`).toBeTruthy();
      expect(op?.['x-auth'], path).toBe(authFor(path));
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? '');
      for (const name of names) {
        const param = op?.parameters?.find((item) => item.in === 'path' && item.name === name);
        expect(param?.schema.format, `${path} ${name}`).toBe('uuid');
      }
      const properties = op?.requestBody?.content['application/json']?.schema.properties ?? {};
      for (const name of names) expect(properties, path).not.toHaveProperty(name);
    }
    const shortlist = doc.paths['/api/v1/host/applicants/{applicationId}/shortlist']?.post;
    expect(shortlist?.requestBody?.content['application/json']?.schema.properties).toHaveProperty('on');
  });

  it('merges the application id into the shortlist handler input', async () => {
    const opts = recorded.find(
      (row) => row.openapi?.method === 'POST' && row.openapi.path.endsWith('/shortlist'),
    );
    expect(opts).toBeTruthy();
    const route = real.apiRoute;
    expect(route).toBeTypeOf('function');
    const handler = route!({
      ...(opts as Parameters<NonNullable<typeof real.apiRoute>>[0]),
      handler: async ({ input }) => input,
    });
    const applicationId = '11111111-1111-4111-8111-111111111111';
    const user: CurrentUser = {
      id: newId(),
      clerkUserId: 'user_host',
      accountType: 'host',
      email: null,
    };
    asHost({ user, orgId: newId(), role: 'owner' });
    const res = await call(
      handler,
      request('POST', `/api/v1/host/applicants/${applicationId}/shortlist`, { body: { on: true } }),
      { applicationId },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ on: true, applicationId });
  });
});
