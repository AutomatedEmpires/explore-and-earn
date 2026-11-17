// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';
import { ApiError, apiFetch } from './api';

setupMswServer();

describe('apiFetch', () => {
  it('returns the JSON body and sends `json` as a JSON body', async () => {
    let received: unknown = null;
    server.use(
      http.put(apiUrl('/api/v1/me/notification-preferences'), async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ items: [] });
      }),
    );
    await expect(
      apiFetch('/api/v1/me/notification-preferences', {
        method: 'PUT',
        json: { category: 'jobs', channel: 'push', enabled: false },
      }),
    ).resolves.toEqual({ items: [] });
    expect(received).toEqual({ category: 'jobs', channel: 'push', enabled: false });
  });

  it('throws ApiError with the status, code and reason of an error envelope', async () => {
    server.use(
      http.post(apiUrl('/api/v1/applications'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'conflict',
              message: 'The listing changed',
              details: { reason: 'listing_changed', currentRevisionId: 'r2' },
              requestId: 'req_1',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const err = await apiFetch('/api/v1/applications', { method: 'POST', json: {} }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'conflict', reason: 'listing_changed' });
    expect((err as ApiError).details).toEqual({
      reason: 'listing_changed',
      currentRevisionId: 'r2',
    });
  });

  it('returns undefined for 204 and has no reason without details', async () => {
    server.use(
      http.delete(apiUrl('/api/v1/me/ai-consent'), () => new HttpResponse(null, { status: 204 })),
      http.get(apiUrl('/api/v1/me/profile'), () =>
        HttpResponse.json({ error: { code: 'unauthorized', message: 'Sign in' } }, { status: 401 }),
      ),
    );
    await expect(apiFetch('/api/v1/me/ai-consent', { method: 'DELETE' })).resolves.toBeUndefined();
    await expect(apiFetch('/api/v1/me/profile')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      reason: null,
    });
  });
});
