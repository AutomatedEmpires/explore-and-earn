// In-memory SP3 for SP4 unit tests (SP4 plan Task 6): the two discovery functions SP4 calls.
// registerSeekerOverlay captures the provider SP4 registers; recordListingEvent records events.
//
//   vi.mock('@/modules/discovery', async (orig) => ({
//     ...(await orig<typeof import('@/modules/discovery')>()),
//     ...(await import('@tests/fakes/sp4/sp3')).discoveryModule,
//   }));
//   beforeEach(() => resetSp3());
//
// This file imports no module at runtime, so it can stand in for one.
import type { SeekerOverlayProvider } from '@/modules/discovery';

type Discovery = typeof import('@/modules/discovery');
type ListingEvent = Parameters<Discovery['recordListingEvent']>[1];

/** The overlay SP4 registered at module load, or null. */
export const overlay: { current: SeekerOverlayProvider | null } = { current: null };

/** Every listing event recorded, oldest first. */
export const calls: { listingEvents: ListingEvent[] } = { listingEvents: [] };

/** Forgets recorded events. The captured overlay stays (it is registered once, at load). */
export function resetSp3(): void {
  calls.listingEvents.length = 0;
}

const registerSeekerOverlay: Discovery['registerSeekerOverlay'] = (p) => {
  overlay.current = p;
};

const recordListingEvent: Discovery['recordListingEvent'] = async (_db, e) => {
  // The real table dedupes on dedupeKey; so does the fake.
  if (e.dedupeKey && calls.listingEvents.some((x) => x.dedupeKey === e.dedupeKey)) return;
  calls.listingEvents.push(e);
};

/** Replaces these discovery functions; spread over the real module. */
export const discoveryModule = { registerSeekerOverlay, recordListingEvent };
