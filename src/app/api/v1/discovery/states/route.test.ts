// GET /api/v1/discovery/states (FD-8 addendum, plan Task 49): one live count per US_STATES
// code for a guest, private, and an unknown time zone still works (Review Focus 3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { US_STATES, type StateCount } from '@/lib/discovery';
import { countListingsByState } from '@/modules/discovery';
import { buildOpenApi } from '@/server/openapi';
import { GET } from './route';

vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  countListingsByState: vi.fn(),
}));

const counts: StateCount[] = US_STATES.map((s) => ({
  code: s.code,
  count: s.code === 'CO' ? 12 : 0,
  capped: false,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/discovery/states', () => {
  it('returns all 56 counts for a guest, privately', async () => {
    vi.mocked(countListingsByState).mockResolvedValue(counts);
    const res = await GET(
      new Request('http://localhost:3000/api/v1/discovery/states?tz=America/Denver'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const json = (await res.json()) as { states: StateCount[] };
    expect(json.states).toHaveLength(56);
    expect(json.states.find((s) => s.code === 'CO')).toEqual({
      code: 'CO',
      count: 12,
      capped: false,
    });
    expect(vi.mocked(countListingsByState).mock.calls[0]?.[1]).toEqual({ tz: 'America/Denver' });
  });

  it('falls back to Chicago for an unknown zone, from the param or the cookie', async () => {
    vi.mocked(countListingsByState).mockResolvedValue(counts);
    expect(
      (await GET(new Request('http://localhost:3000/api/v1/discovery/states?tz=Etc/Unknown')))
        .status,
    ).toBe(200);
    const cookie = new Request('http://localhost:3000/api/v1/discovery/states', {
      headers: { cookie: 'ee_tz=Not%2FAZone' },
    });
    expect((await GET(cookie)).status).toBe(200);
    expect(vi.mocked(countListingsByState).mock.calls.map((c) => c[1])).toEqual([
      { tz: 'America/Chicago' },
      { tz: 'America/Chicago' },
    ]);
    const denver = new Request('http://localhost:3000/api/v1/discovery/states', {
      headers: { cookie: 'theme=dark; ee_tz=America%2FDenver' },
    });
    await GET(denver);
    expect(vi.mocked(countListingsByState).mock.calls.at(-1)?.[1]).toEqual({
      tz: 'America/Denver',
    });
  });

  it('is documented', () => {
    expect(Object.keys(buildOpenApi().paths)).toContain('/api/v1/discovery/states');
  });
});
