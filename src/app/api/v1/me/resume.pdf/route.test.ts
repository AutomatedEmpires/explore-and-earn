// GET /api/v1/me/resume.pdf (SP4 plan Task 14): the live snapshot, without work authorization,
// and the content-disposition for a name that is not ASCII.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '@/modules/profiles';
import type { CurrentUser } from '@/modules/identity';
import { mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { asSeeker, call, request, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
const mocks = vi.hoisted(() => ({ buildProfileSnapshot: vi.fn() }));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  buildProfileSnapshot: mocks.buildProfileSnapshot,
}));

const t = setupRouteDb();
let seeker: CurrentUser;

beforeEach(async () => {
  seeker = await seedUser(t.db, { accountType: 'seeker' });
  asSeeker(seeker);
  mocks.buildProfileSnapshot.mockReset();
  mocks.buildProfileSnapshot.mockResolvedValue(mayaSnapshot());
});

describe('GET /api/v1/me/resume.pdf', () => {
  it('returns a private PDF of the live snapshot with work authorization excluded', async () => {
    const res = await call(GET, request('GET', '/api/v1/me/resume.pdf'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.buildProfileSnapshot).toHaveBeenCalledWith(t.db, seeker.id, {
      includeWorkAuthorization: false,
    });
  });

  it('renders ?template=compact through TEMPLATES compact@1', async () => {
    const spy = vi.spyOn(TEMPLATES['compact@1'], 'draw');
    const res = await call(
      GET,
      request('GET', '/api/v1/me/resume.pdf', { query: { template: 'compact' } }),
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("names José Núñez's file with an ASCII fallback and a UTF-8 filename*", async () => {
    mocks.buildProfileSnapshot.mockResolvedValue(
      mayaSnapshot({ firstName: 'José', lastName: 'Núñez' }),
    );
    const res = await call(GET, request('GET', '/api/v1/me/resume.pdf'));
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="Jose-Nunez-resume.pdf"; filename*=UTF-8''Jos%C3%A9-N%C3%BA%C3%B1ez-resume.pdf`,
    );
  });
});
