// @vitest-environment jsdom
// axe over every state of the listing page, rendered in jsdom: the guest and seeker detail, a
// listing without housing or meals, closed, not found, couldn't load, offline and the skeleton.
// jsdom has no layout, so color contrast is left to src/ui/tokens.test.ts (every token pair) and
// the Playwright run; everything else in WCAG 2.2 A and AA is checked here.
import { createRequire } from 'node:module';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListingError from '../[id]/error';
import ListingNotFound from '../[id]/not-found';
import { buildListingView } from '../_lib/listing-view';
import { detailOf, LISTING_ID, lodgeHousekeeper } from '../_lib/sample-listing';
import { ClosedListing } from './closed-listing';
import { DetailSkeleton } from './detail-skeleton';
import { ListingDetail } from './listing-detail';
import type { ListingActionsInit } from './listing-actions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Violation = { id: string; impact: string | null; nodes: { target: string[] }[] };
type Axe = { run(context: Element, options: object): Promise<{ violations: Violation[] }> };

// axe-core ships with @axe-core/playwright; load it from there rather than add a dependency.
const local = createRequire(import.meta.url);
const axe = createRequire(local.resolve('@axe-core/playwright'))('axe-core') as Axe;

async function seriousOrCritical(ui: ReactElement): Promise<string[]> {
  const { container } = render(<main>{ui}</main>);
  const { violations } = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const PATH = `/jobs/view/${LISTING_ID}/lodge-housekeeper`;
const guest: ListingActionsInit = {
  listingId: LISTING_ID,
  title: 'Lodge housekeeper',
  source: 'other',
  seeker: false,
  disposition: null,
  applied: false,
  applyHref: `/sign-in?redirect_url=${encodeURIComponent(`/apply/${LISTING_ID}?source=other`)}`,
  signInHref: `/sign-in?redirect_url=${encodeURIComponent(PATH)}`,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('axe: no serious or critical issues', () => {
  it('the guest detail, with both action bars in the document', async () => {
    const view = buildListingView(detailOf(lodgeHousekeeper()), new Map());
    expect(await seriousOrCritical(<ListingDetail view={view} actions={guest} path={PATH} />)).toEqual(
      [],
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Lodge housekeeper' })).toBeInTheDocument();
    const deal = screen.getByRole('list', { name: 'The deal' });
    expect(deal).toHaveTextContent('Pay: $22 an hour');
    expect(deal).toHaveTextContent('Housing: Cabin, $12 a night, taken from pay');
  });

  it('the seeker detail, saved and applied', async () => {
    const view = buildListingView(detailOf(lodgeHousekeeper()), new Map());
    const seeker = { ...guest, seeker: true, disposition: 'saved' as const, applied: true };
    expect(await seriousOrCritical(<ListingDetail view={view} actions={seeker} path={PATH} />)).toEqual(
      [],
    );
    expect(screen.getAllByRole('link', { name: 'Applied' })).toHaveLength(2);
  });

  it('a listing with no housing, no meals and no cover', async () => {
    const detail = detailOf(
      lodgeHousekeeper((c) => {
        c.housing = { provided: false };
        c.meals = { provided: false };
      }),
      { cover: null },
    );
    const view = buildListingView(detail, new Map());
    expect(await seriousOrCritical(<ListingDetail view={view} actions={guest} path={PATH} />)).toEqual(
      [],
    );
    expect(screen.queryByRole('heading', { name: 'Housing' })).toBeNull();
  });

  it('closed', async () => {
    const detail = detailOf(lodgeHousekeeper());
    expect(
      await seriousOrCritical(
        <ClosedListing card={{ ...detail, status: 'closed' }} seeker={false} signInHref="/sign-in" />,
      ),
    ).toEqual([]);
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull();
  });

  it('not found', async () => {
    expect(await seriousOrCritical(<ListingNotFound />)).toEqual([]);
  });

  it('couldn’t load and offline', async () => {
    expect(await seriousOrCritical(<ListingError error={new Error('x')} retry={() => undefined} />)).toEqual(
      [],
    );
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('the skeleton, announced as loading', async () => {
    expect(await seriousOrCritical(<DetailSkeleton />)).toEqual([]);
    expect(screen.getByRole('status', { name: 'Loading the job' })).toBeInTheDocument();
  });
});
