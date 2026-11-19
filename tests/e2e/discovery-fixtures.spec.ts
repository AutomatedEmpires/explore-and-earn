// Discovery e2e fixtures (SP3 plan Task 27). After `pnpm e2e:seed`, search shows the open
// jobs and the closed listing is still readable as closed.
import { expect, test } from '@playwright/test';
import { readSeed } from './fixtures/discovery-seed';

test('seeded search returns the open jobs and the closed listing stays closed', async ({
  request,
}) => {
  const seed = readSeed();

  const search = await request.get('/api/v1/discovery/search');
  expect(search.ok()).toBe(true);
  const body = (await search.json()) as { items: unknown[] };
  expect(body.items.length).toBeGreaterThanOrEqual(4);

  const closed = await request.get(`/api/v1/listings/${seed.listings.closed.id}`);
  expect(closed.ok()).toBe(true);
  expect(await closed.json()).toMatchObject({ status: 'closed' });
});
