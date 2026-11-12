// The US Census geocoder client and the stub (Task 20). fetch is injected, so no network.
import { describe, expect, it } from 'vitest';
import match from './fixtures/census-address-match.json';
import noMatch from './fixtures/census-no-match.json';
import { censusGeocoder, stubGeocoder } from './geocoder';

type Call = { url: URL; init: RequestInit | undefined };

function fakeFetch(respond: (url: URL) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    calls.push({ url, init });
    return respond(url);
  }) as typeof fetch;
  return { fn, calls };
}

const DC = { line1: '4600 Silver Hill Rd', city: 'Washington', state: 'DC', postalCode: '20233' };

describe('censusGeocoder', () => {
  it('calls the Census address endpoint and maps each match to { lat, lng, matched }', async () => {
    const f = fakeFetch(() => Response.json(match));
    const candidates = await censusGeocoder({ fetch: f.fn }).geocode(DC);

    expect(candidates).toEqual([
      {
        lat: 38.84601622386617,
        lng: -76.92748724230096,
        matched: '4600 SILVER HILL RD, WASHINGTON, DC, 20233',
      },
    ]);
    expect(f.calls).toHaveLength(1);
    const url = f.calls[0]?.url ?? new URL('about:blank');
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://geocoding.geo.census.gov/geocoder/locations/address',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      street: '4600 Silver Hill Rd',
      city: 'Washington',
      state: 'DC',
      zip: '20233',
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    expect(f.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends an empty zip when there is no postal code', async () => {
    const f = fakeFetch(() => Response.json(match));
    await censusGeocoder({ fetch: f.fn }).geocode({
      line1: '1 Main St',
      city: 'Seward',
      state: 'AK',
    });
    expect(f.calls[0]?.url.searchParams.get('zip')).toBe('');
  });

  it('returns no candidates for an empty addressMatches', async () => {
    const f = fakeFetch(() => Response.json(noMatch));
    expect(await censusGeocoder({ fetch: f.fn }).geocode(DC)).toEqual([]);
  });

  it('returns no candidates on an HTTP error, a bad body, a network error or a timeout', async () => {
    const http500 = fakeFetch(() => new Response('Internal error', { status: 500 }));
    expect(await censusGeocoder({ fetch: http500.fn }).geocode(DC)).toEqual([]);

    const html = fakeFetch(() => new Response('<html>busy</html>', { status: 200 }));
    expect(await censusGeocoder({ fetch: html.fn }).geocode(DC)).toEqual([]);

    const odd = fakeFetch(() => Response.json({ result: { addressMatches: [{ nope: true }] } }));
    expect(await censusGeocoder({ fetch: odd.fn }).geocode(DC)).toEqual([]);

    const down = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await censusGeocoder({ fetch: down.fn }).geocode(DC)).toEqual([]);

    const slow = fakeFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          // Rejects when the geocoder's own timeout aborts the request.
          const signal = slow.calls[0]?.init?.signal;
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const started = Date.now();
    expect(await censusGeocoder({ fetch: slow.fn, timeoutMs: 50 }).geocode(DC)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('stubGeocoder', () => {
  it('returns one fixed candidate, or none for __nomatch__', async () => {
    const stub = stubGeocoder();
    expect(await stub.geocode({ line1: '1 Harbor Rd', city: 'Seward', state: 'AK' })).toEqual([
      { lat: 60.1042, lng: -149.4422, matched: '1 Harbor Rd, Seward, AK' },
    ]);
    expect(
      await stub.geocode({ line1: '__nomatch__ 1 Harbor Rd', city: 'Seward', state: 'AK' }),
    ).toEqual([]);
  });
});
