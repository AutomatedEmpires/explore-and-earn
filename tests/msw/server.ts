// The MSW server for SP4 component tests (SP4 plan Task 6): W6 and W7 screens and _features call
// the HTTP API through apiFetch, and their tests answer those calls here until the Phase B
// routes land. Requests MSW doesn't handle fail the test, so a screen can't quietly call an API
// the test didn't expect.
//
//   import { http, HttpResponse } from 'msw';
//   import { server, useMswServer } from '@tests/msw/server';
//   useMswServer();
//   server.use(http.get(apiUrl('/api/v1/me/profile'), () => HttpResponse.json(profile)));
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const server = setupServer();

/** The absolute URL of an API path, as a jsdom test's relative fetch resolves it. */
export function apiUrl(path: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost:3000';
  return new URL(path, origin).toString();
}

/** Starts the server for the test file and resets its handlers after each test. */
export function useMswServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
