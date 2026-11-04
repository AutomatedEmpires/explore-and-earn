// Business verification signals (SP2 spec 8.4): email domain, free and disposable providers,
// website reachability and domain match, RDAP domain age, card checks, US location and the
// operator blocklist. Sibling SP2 modules are W0 fakes; settings is real.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { FIXED_NOW, seedHostOrg } from '../../../tests/helpers/sp2';
import {
  FREE_EMAIL_DOMAINS,
  collectSignals,
  hardFlags,
  rdapRegisteredAt,
  type SignalDeps,
  type VerificationSignals,
} from './signals';

vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  billingFake.reset();
  locationsFake.reset();
  await t.db.execute(sql`delete from app.settings`);
});

const DAY_MS = 86_400_000;

function deps(o: Partial<SignalDeps> = {}) {
  const fetchText = vi.fn<SignalDeps['fetchText']>(async (url) => ({
    status: 200,
    finalUrl: url,
    text: 'Kettle Ridge Lodge, a family lodge in the Cascades',
  }));
  const rdap = vi.fn<SignalDeps['rdapRegisteredAt']>(async () => null);
  return {
    fetchText,
    rdap,
    deps: { fetchText, rdapRegisteredAt: rdap, now: FIXED_NOW, ...o } satisfies SignalDeps,
  };
}

async function org(ownerEmail: string, websiteUrl: string | null = null) {
  const seeded = await seedHostOrg(t.db, { ownerEmail });
  if (websiteUrl) {
    await t.db.execute(
      sql`update app.organizations set website_url = ${websiteUrl} where id = ${seeded.orgId}`,
    );
  }
  return seeded.orgId;
}

describe('collectSignals', () => {
  it('flags a free email provider and skips the website and domain age without one', async () => {
    const orgId = await org(`maya-${newId().slice(-6)}@gmail.com`);
    const d = deps();
    const s = await collectSignals(t.db, orgId, d.deps);
    expect(s).toMatchObject({
      emailDomain: 'gmail.com',
      freeEmail: true,
      disposableEmail: false,
      websiteReachable: null,
      domainMatch: null,
      domainAgeDays: null,
      websiteText: null,
      blockedDomain: false,
    });
    expect(d.fetchText).not.toHaveBeenCalled();
    expect(d.rdap).not.toHaveBeenCalled();
    expect(FREE_EMAIL_DOMAINS.has('proton.me')).toBe(true);
  });

  it('flags a disposable email domain', async () => {
    const orgId = await org('x@mailinator.com');
    const s = await collectSignals(t.db, orgId, deps().deps);
    expect(s).toMatchObject({
      emailDomain: 'mailinator.com',
      freeEmail: false,
      disposableEmail: true,
    });
    expect(hardFlags(s)).toEqual(['disposable_email']);
  });

  it('matches the email domain with the website host minus www and reads the website', async () => {
    const orgId = await org('maya@kettle.com', 'https://www.kettle.com');
    const d = deps();
    const s = await collectSignals(t.db, orgId, d.deps);
    expect(s).toMatchObject({
      emailDomain: 'kettle.com',
      freeEmail: false,
      disposableEmail: false,
      websiteReachable: true,
      domainMatch: true,
      websiteText: 'Kettle Ridge Lodge, a family lodge in the Cascades',
    });
    expect(d.fetchText).toHaveBeenCalledWith('https://www.kettle.com');
    expect(d.rdap).toHaveBeenCalledWith('kettle.com');
  });

  it('reports a website that cannot be fetched or answers with an error', async () => {
    const orgId = await org('sam@lodge.com', 'https://other-lodge.com/about');
    const failing = deps({
      fetchText: async () => {
        throw new Error('refused');
      },
    });
    expect(await collectSignals(t.db, orgId, failing.deps)).toMatchObject({
      websiteReachable: false,
      websiteText: null,
      domainMatch: false,
    });

    const notFound = deps({
      fetchText: async (url) => ({ status: 404, finalUrl: url, text: 'Not found' }),
    });
    expect(await collectSignals(t.db, orgId, notFound.deps)).toMatchObject({
      websiteReachable: false,
      websiteText: null,
    });
  });

  it('measures the domain age from the RDAP registration date', async () => {
    const orgId = await org('owner@kettle-age.com', 'https://kettle-age.com');
    const rdapFetch = vi.fn(async () =>
      Response.json({
        objectClassName: 'domain',
        events: [
          { eventAction: 'last changed', eventDate: '2025-01-01T00:00:00Z' },
          { eventAction: 'registration', eventDate: '2019-05-01T00:00:00Z' },
        ],
      }),
    );
    const s = await collectSignals(
      t.db,
      orgId,
      deps({ rdapRegisteredAt: (d) => rdapRegisteredAt(d, { fetch: rdapFetch }) }).deps,
    );
    const expected = Math.floor((FIXED_NOW.getTime() - Date.UTC(2019, 4, 1)) / DAY_MS);
    expect(expected).toBe(2743);
    expect(s.domainAgeDays).toBe(expected);
    expect(rdapFetch).toHaveBeenCalledWith(
      'https://rdap.org/domain/kettle-age.com',
      expect.objectContaining({ headers: expect.anything() }),
    );

    const failing = vi.fn(async () => new Response('oops', { status: 500 }));
    const none = await collectSignals(
      t.db,
      orgId,
      deps({ rdapRegisteredAt: (d) => rdapRegisteredAt(d, { fetch: failing }) }).deps,
    );
    expect(none.domainAgeDays).toBeNull();
  });

  it('flags a domain on the verification blocklist, including subdomains', async () => {
    await t.db.execute(sql`
      insert into app.settings (key, value)
      values ('verification.blocked_domains', '["kettle.com"]'::jsonb)
    `);
    const byEmail = await org('maya@kettle.com');
    expect((await collectSignals(t.db, byEmail, deps().deps)).blockedDomain).toBe(true);

    const bySite = await org('sam@gmail.com', 'https://shop.kettle.com');
    expect((await collectSignals(t.db, bySite, deps().deps)).blockedDomain).toBe(true);

    const clean = await org('sam@notkettle.com');
    expect((await collectSignals(t.db, clean, deps().deps)).blockedDomain).toBe(false);
  });

  it('takes the card checks from billing and the location country from locations', async () => {
    const orgId = await org('owner@cards.com');
    expect(await collectSignals(t.db, orgId, deps().deps)).toMatchObject({
      hasCard: true,
      cvcCheck: 'pass',
      postalCheck: 'pass',
      locationInUs: false,
    });

    billingFake.setCardChecks(orgId, { hasCard: true, cvcCheck: 'fail', postalCheck: null });
    locationsFake.setLocation({ id: newId(), orgId, state: 'WA' });
    const s = await collectSignals(t.db, orgId, deps().deps);
    expect(s).toMatchObject({ hasCard: true, cvcCheck: 'fail', postalCheck: null, locationInUs: true });
    expect(hardFlags(s)).toEqual(['cvc_failed']);
  });
});

describe('rdapRegisteredAt', () => {
  it('reads the registration event, and is null on any failure', async () => {
    const ok = vi.fn(async () =>
      Response.json({ events: [{ eventAction: 'registration', eventDate: '2019-05-01T00:00:00Z' }] }),
    );
    expect(await rdapRegisteredAt('Kettle.com.', { fetch: ok })).toEqual(
      new Date('2019-05-01T00:00:00Z'),
    );
    expect(ok).toHaveBeenCalledWith('https://rdap.org/domain/kettle.com', expect.anything());

    const noEvent = vi.fn(async () => Response.json({ events: [] }));
    expect(await rdapRegisteredAt('kettle.com', { fetch: noEvent })).toBeNull();

    const throws = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await rdapRegisteredAt('kettle.com', { fetch: throws })).toBeNull();

    const notJson = vi.fn(async () => new Response('<html>', { status: 200 }));
    expect(await rdapRegisteredAt('kettle.com', { fetch: notJson })).toBeNull();
  });

  it('never looks up a reserved or malformed domain', async () => {
    const spy = vi.fn(async () => Response.json({}));
    for (const d of ['kettle.test', 'example.com', 'localhost', 'not a domain', '10.0.0.1']) {
      expect(await rdapRegisteredAt(d, { fetch: spy })).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('hardFlags', () => {
  it('names a blocked domain, a disposable email and a failed CVC check', () => {
    const s: VerificationSignals = {
      emailDomain: 'mailinator.com',
      freeEmail: false,
      disposableEmail: true,
      websiteReachable: null,
      domainMatch: null,
      domainAgeDays: null,
      cvcCheck: 'fail',
      postalCheck: 'pass',
      hasCard: true,
      locationInUs: true,
      blockedDomain: true,
      websiteText: null,
    };
    expect(hardFlags(s)).toEqual(['blocked_domain', 'disposable_email', 'cvc_failed']);
    expect(
      hardFlags({ ...s, blockedDomain: false, disposableEmail: false, cvcCheck: 'unchecked' }),
    ).toEqual([]);
  });
});
