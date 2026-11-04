// Link safety: the Web Risk provider, the stub, and the link_domains cache.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW } from '../../../tests/helpers/sp2';
import { domainStatus, stubLinkSafety, webRisk, type LinkSafety } from './link-safety';

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('webRisk', () => {
  it('asks uris:search for the three threat types', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) => jsonResponse({}));
    expect(await webRisk('key-1', fetchFn).lookup('https://kettle.com/apply?a=1')).toBe('safe');
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://webrisk.googleapis.com/v1/uris:search');
    expect(url.searchParams.getAll('threatTypes')).toEqual([
      'MALWARE',
      'SOCIAL_ENGINEERING',
      'UNWANTED_SOFTWARE',
    ]);
    expect(url.searchParams.get('uri')).toBe('https://kettle.com/apply?a=1');
    expect(url.searchParams.get('key')).toBe('key-1');
  });

  it('reads a threat as flagged, and failures as unreachable', async () => {
    const threat = vi.fn(async () =>
      jsonResponse({ threat: { threatTypes: ['MALWARE'], expireTime: '2027-01-01T00:00:00Z' } }),
    );
    expect(await webRisk('k', threat).lookup('https://bad.example/')).toBe('flagged');
    const down = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await webRisk('k', down).lookup('https://a.example/')).toBe('unreachable');
    const error = vi.fn(async () => jsonResponse({ error: 'boom' }, 503));
    expect(await webRisk('k', error).lookup('https://a.example/')).toBe('unreachable');
  });
});

describe('stubLinkSafety', () => {
  it('reads the markers', async () => {
    const ls = stubLinkSafety();
    expect(await ls.lookup('https://a.example/__flag__')).toBe('flagged');
    expect(await ls.lookup('https://a.example/__down__')).toBe('unreachable');
    expect(await ls.lookup('https://a.example/')).toBe('safe');
  });
});

describe('domainStatus', () => {
  const counting = (answer: Awaited<ReturnType<LinkSafety['lookup']>>) => {
    const lookup = vi.fn(async () => answer);
    return { ls: { lookup } satisfies LinkSafety, lookup };
  };

  async function row(domain: string) {
    const [r] = await queryRows<{ status: string; source: string }>(
      db,
      sql`select status, source from app.link_domains where domain = ${domain}`,
    );
    return r;
  }

  it('looks a domain up and caches the answer', async () => {
    const { ls, lookup } = counting('flagged');
    expect(await domainStatus(db, 'bad.example', 'https://bad.example/x', ls, FIXED_NOW)).toBe(
      'blocked',
    );
    expect(await row('bad.example')).toEqual({ status: 'blocked', source: 'web_risk' });
    expect(await domainStatus(db, 'bad.example', 'https://bad.example/y', ls, FIXED_NOW)).toBe(
      'blocked',
    );
    expect(lookup).toHaveBeenCalledTimes(1);

    const down = counting('unreachable');
    expect(
      await domainStatus(db, 'slow.example', 'https://slow.example/', down.ls, FIXED_NOW),
    ).toBe('unknown');
    expect(await row('slow.example')).toEqual({ status: 'unknown', source: 'web_risk' });
  });

  it('reuses an answer younger than 30 days, and rechecks an older one', async () => {
    const day = 86_400_000;
    await db.execute(sql`
      insert into app.link_domains (domain, status, source, checked_at) values
        ('fresh.example', 'allowed', 'web_risk', ${new Date(FIXED_NOW.getTime() - 10 * day)}),
        ('stale.example', 'allowed', 'web_risk', ${new Date(FIXED_NOW.getTime() - 31 * day)})
    `);
    const { ls, lookup } = counting('flagged');
    expect(await domainStatus(db, 'fresh.example', 'https://fresh.example/', ls, FIXED_NOW)).toBe(
      'allowed',
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(await domainStatus(db, 'stale.example', 'https://stale.example/', ls, FIXED_NOW)).toBe(
      'blocked',
    );
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
