// @vitest-environment jsdom
// Report, Block and Mute on the listing detail (issue 224): a signed-in seeker reports the job in
// the ReportSheet, blocks the host with the BlockDialog and mutes it with the MuteToggle, each as
// #145 built them; a guest keeps the link to /report, which signs them in first. axe runs over
// each state; jsdom has no layout, so color contrast is left to src/ui/tokens.test.ts and the
// Playwright run.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seriousOrCritical } from '@/app/_features/safety/axe-test-helper';
import { REPORT_PRIVACY } from '@/app/_features/safety/copy';
import { ALSO_WITHDRAW, blockSchema, REPORT_THANKS, reportSchema } from '@/lib/safety';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';
import { buildListingView } from '../_lib/listing-view';
import { detailOf, LISTING_ID, lodgeHousekeeper } from '../_lib/sample-listing';
import type { ListingActionsInit } from './listing-actions';
import { ListingDetail } from './listing-detail';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

setupMswServer();

const PATH = `/jobs/view/${LISTING_ID}/lodge-housekeeper`;
// The sample listing's host (sample-listing.ts).
const ORG_ID = '0190a1b2-c3d4-7e5f-8a9b-000000000099';
const HOST = { orgId: ORG_ID, orgName: 'Kettle Ridge Lodge', muted: false };
// The Checkbox label wraps its hint, so the accessible name starts with the label.
const WITHDRAW_NAME = new RegExp(`^${ALSO_WITHDRAW}`);

const seeker: ListingActionsInit = {
  listingId: LISTING_ID,
  title: 'Lodge housekeeper',
  source: 'other',
  seeker: true,
  disposition: null,
  applied: false,
  applyHref: `/apply/${LISTING_ID}?source=other`,
  signInHref: `/sign-in?redirect_url=${encodeURIComponent(PATH)}`,
};
const guest: ListingActionsInit = {
  ...seeker,
  seeker: false,
  applyHref: `/sign-in?redirect_url=${encodeURIComponent(`/apply/${LISTING_ID}?source=other`)}`,
};

type Safety = { orgId: string; orgName: string; muted: boolean } | null;

function renderDetail(o: { actions?: ListingActionsInit; safety?: Safety } = {}) {
  const view = buildListingView(detailOf(lodgeHousekeeper()), new Map());
  return render(
    <main>
      <ListingDetail
        view={view}
        actions={o.actions ?? seeker}
        path={PATH}
        safety={o.safety === undefined ? HOST : o.safety}
      />
    </main>,
  );
}

/** Records each body sent to `path` and answers with `reply`. */
function capture(method: 'post' | 'put' | 'delete', path: string, reply: () => Response) {
  const calls: unknown[] = [];
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      const text = await request.text();
      calls.push(text === '' ? null : JSON.parse(text));
      return reply();
    }),
  );
  return calls;
}

const noContent = () => new HttpResponse(null, { status: 204 });

beforeEach(() => {
  // The page's own view beacon (listing-actions.tsx).
  server.use(http.post(apiUrl(`/api/v1/listings/${LISTING_ID}/events`), noContent));
});

describe('Listing detail safety: a guest', () => {
  it('keeps the link to /report and has no Block or Mute', async () => {
    const { container } = renderDetail({ actions: guest, safety: null });
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      `/report?subject=listing:${LISTING_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block host' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('is the guest row too when the page leaves `safety` out, as the h2b harness does', () => {
    const view = buildListingView(detailOf(lodgeHousekeeper()), new Map());
    render(<ListingDetail view={view} actions={guest} path={PATH} />);
    expect(screen.getByRole('link', { name: 'Report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Block host' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Listing detail safety: a signed-in seeker', () => {
  it('has Report, Share and Block host in one row, then the mute switch', async () => {
    const { container } = renderDetail();
    expect(screen.queryByRole('link', { name: 'Report' })).toBeNull();
    const report = screen.getByRole('button', { name: 'Report' });
    const row = report.parentElement;
    expect(row).not.toBeNull();
    // Report and Share as on the guest's row, then Block host.
    expect(
      within(row as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Report', 'Share', 'Block host']);
    const mute = screen.getByRole('switch', { name: 'Mute Kettle Ridge Lodge' });
    expect(mute).not.toBeChecked();
    expect(
      screen.getByText(
        "Kettle Ridge Lodge can't invite you, and you stop following them. You still see their jobs and can apply.",
      ),
    ).toBeInTheDocument();
    // The trust line still comes first.
    expect(
      screen.getByText('You never pay to get a job. Report any listing that asks you to.'),
    ).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('reports the job in the sheet, which says reports are private', async () => {
    const bodies = capture('post', '/api/v1/reports', () =>
      HttpResponse.json({ reportId: 'r1' }, { status: 201 }),
    );
    renderDetail();
    const opener = screen.getByRole('button', { name: 'Report' });
    fireEvent.click(opener);

    const sheet = await screen.findByRole('dialog', { name: 'Report this job' });
    expect(within(sheet).getByText(REPORT_PRIVACY)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Send report' })).toBeDisabled();
    expect(await seriousOrCritical(sheet)).toEqual([]);

    fireEvent.click(within(sheet).getByRole('radio', { name: 'Asks for money' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send report' }));
    expect(await within(sheet).findByText(REPORT_THANKS)).toBeInTheDocument();
    expect(bodies).toEqual([
      { subjectType: 'listing', subjectId: LISTING_ID, reason: 'asks_for_money' },
    ]);
    expect(reportSchema.safeParse(bodies[0]).success).toBe(true);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('blocks the host: the withdraw box is off, the body says the host is not told', async () => {
    const bodies = capture('put', '/api/v1/me/blocks', noContent);
    const { container } = renderDetail();
    const opener = screen.getByRole('button', { name: 'Block host' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Block Kettle Ridge Lodge?' });
    expect(dialog).toHaveTextContent(
      "You won't see Kettle Ridge Lodge's jobs. You can't message each other, Kettle Ridge Lodge can't invite you, and you stop following them. Kettle Ridge Lodge isn't told.",
    );
    expect(within(dialog).getByRole('checkbox', { name: WITHDRAW_NAME })).not.toBeChecked();
    expect(await seriousOrCritical(dialog)).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bodies).toEqual([{ targetType: 'org', targetId: ORG_ID, withdrawApplications: false }]);
    expect(blockSchema.safeParse(bodies[0]).success).toBe(true);
    // The approved W7 preview's line, announced; the button goes and its neighbour takes focus.
    expect(await screen.findByText('You blocked Kettle Ridge Lodge.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByRole('button', { name: 'Block host' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Report' })).toHaveFocus());
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('withdraws the applications only when the box is ticked', async () => {
    const bodies = capture('put', '/api/v1/me/blocks', noContent);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Block host' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block Kettle Ridge Lodge?' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: WITHDRAW_NAME }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ targetType: 'org', targetId: ORG_ID, withdrawApplications: true });
  });

  it('a block that fails says so in the dialog, and says nothing on the page', async () => {
    capture('put', '/api/v1/me/blocks', () =>
      HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 }),
    );
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Block host' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block Kettle Ridge Lodge?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't block Kettle Ridge Lodge. Try again.",
    );
    expect(screen.queryByText('You blocked Kettle Ridge Lodge.')).toBeNull();
  });

  it('mutes the host with the switch, and unmutes it', async () => {
    const puts = capture('put', `/api/v1/me/mutes/${ORG_ID}`, noContent);
    const deletes = capture('delete', `/api/v1/me/mutes/${ORG_ID}`, noContent);
    renderDetail();
    const mute = screen.getByRole('switch', { name: 'Mute Kettle Ridge Lodge' });
    fireEvent.click(mute);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(mute).toBeChecked();
    fireEvent.click(mute);
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(mute).not.toBeChecked();
  });

  it('shows a host the seeker already muted as muted', async () => {
    const { container } = renderDetail({ safety: { ...HOST, muted: true } });
    expect(screen.getByRole('switch', { name: 'Mute Kettle Ridge Lodge' })).toBeChecked();
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
