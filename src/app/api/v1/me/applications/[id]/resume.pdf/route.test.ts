// GET /api/v1/me/applications/{id}/resume.pdf (SP4 plan Task 14): the frozen snapshot, including
// after the listing is removed, and no live SP2 read.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractText } from 'unpdf';
import type { ReceiptDto } from '@/lib/applications';
import type { CurrentUser } from '@/modules/identity';
import { fakeListing, listingsModule, resetSp2, setListingState } from '@tests/fakes/sp4/sp2';
import { mayaApplicationSnapshot, mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { asSeeker, request, seedOrg, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
const mocks = vi.hoisted(() => ({ getReceipt: vi.fn(), buildProfileSnapshot: vi.fn() }));
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  getReceipt: mocks.getReceipt,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  buildProfileSnapshot: mocks.buildProfileSnapshot,
}));

const APP_ID = '019a4a3c-0000-7000-8000-0000000e0001';
const t = setupRouteDb();
let seeker: CurrentUser;
let listingId: string;

function receipt(): ReceiptDto {
  const live = mayaSnapshot();
  const first = live.experience[0];
  if (!first) throw new Error('fixture has no experience');
  return {
    applicationId: APP_ID,
    submittedAt: '2026-01-01T00:00:00.000Z',
    seekerStatus: 'applied',
    snapshot: mayaApplicationSnapshot({
      profile: mayaSnapshot({
        experience: [{ ...first, title: "Ship's cook" }, ...live.experience.slice(1)],
      }),
    }),
    events: [],
    additionalStepCompletedAt: null,
    canWithdraw: true,
    canTickAdditionalStep: false,
  };
}

beforeEach(async () => {
  resetSp2();
  seeker = await seedUser(t.db, { accountType: 'seeker' });
  asSeeker(seeker);
  const { orgId } = await seedOrg(t.db);
  listingId = fakeListing({ orgId, title: 'Deckhand' }).listingId;
  mocks.getReceipt.mockReset();
  mocks.getReceipt.mockResolvedValue(receipt());
  mocks.buildProfileSnapshot.mockReset();
});

async function download(): Promise<{ status: number; text: string }> {
  const res = await GET(request('GET', `/api/v1/me/applications/${APP_ID}/resume.pdf`), {
    params: Promise.resolve({ id: APP_ID }),
  });
  const extracted = await extractText(new Uint8Array(await res.arrayBuffer()), { mergePages: true });
  return { status: res.status, text: extracted.text };
}

describe('GET /api/v1/me/applications/{id}/resume.pdf', () => {
  it('renders the frozen snapshot and does not read the live listing or profile', async () => {
    const spies = (
      ['getPublishedListing', 'getListingSummaries', 'getRevision', 'canAcceptApplications'] as const
    ).map((name) => vi.spyOn(listingsModule, name));
    for (const spy of spies) spy.mockClear();
    setListingState(listingId, 'removed');

    const res = await download();

    expect(res.status).toBe(200);
    expect(res.text).toContain("Ship's cook");
    expect(mocks.buildProfileSnapshot).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(mocks.getReceipt).toHaveBeenCalledWith(t.db, seeker.id, APP_ID);
  });
});
