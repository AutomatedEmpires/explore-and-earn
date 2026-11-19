// @vitest-environment jsdom
// NotificationList (SP4 plan Task 35, spec 7): newest first, 20 a page with Load more, tap to
// mark read and open, Mark all as read, and the loading, empty and error states.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../counts/CountsProvider', () => ({
  useCounts: () => ({ counts: null, refresh }),
}));

const { NotificationList } = await import('./NotificationList');
const { seriousOrCritical } = await import('../safety/axe-test-helper');

setupMswServer();

const NOW = Date.parse('2026-11-19T12:00:00.000Z');

/** The item at `index`, failing the test when it is missing. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`missing item ${index}`);
  return value;
}

function id(n: number): string {
  return `019a4a3c-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

function item(n: number, o: { read?: boolean; url?: string | null } = {}) {
  return {
    id: id(n),
    type: 'applications.submitted',
    category: 'applications',
    title: `Title ${n}`,
    body: `Body ${n}`,
    data: o.url ? { url: o.url } : {},
    url: o.url ?? null,
    readAt: o.read ? '2026-11-19T11:00:00.000Z' : null,
    createdAt: new Date(NOW - n * 60_000).toISOString(),
  };
}

type Item = ReturnType<typeof item>;

function answerList(pages: Item[][], unread = 1) {
  const requests: URL[] = [];
  server.use(
    http.get(apiUrl('/api/v1/notifications'), ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const index = url.searchParams.get('before') ? 1 : 0;
      const items = pages[index] ?? [];
      const nextBefore = index + 1 < pages.length ? (items.at(-1)?.id ?? null) : null;
      return HttpResponse.json({ items, nextBefore, unread });
    }),
  );
  return requests;
}

function answerRead() {
  const bodies: unknown[] = [];
  server.use(
    http.post(apiUrl('/api/v1/notifications/read'), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ unread: 0 });
    }),
  );
  return bodies;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  return () => vi.useRealTimers();
});

describe('NotificationList', () => {
  it('shows a loading state, then the rows newest first with an unread marker', async () => {
    answerList([[item(1), item(2, { read: true })]]);
    render(<NotificationList />);
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument();

    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^Title/).textContent)).toEqual([
      'Title 1',
      'Title 2',
    ]);
    expect(within(at(rows, 0)).getByText('Unread')).toBeInTheDocument();
    expect(within(at(rows, 1)).queryByText('Unread')).not.toBeInTheDocument();
    expect(within(at(rows, 0)).getByText('Body 1')).toBeInTheDocument();
    expect(within(at(rows, 0)).getByText('1 minute ago')).toBeInTheDocument();
  });

  it('asks for 20 at a time and loads the next page with Load more', async () => {
    const first = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const requests = answerList([first, [item(21)]]);
    render(<NotificationList />);
    await screen.findByText('Title 20');
    expect(at(requests, 0).searchParams.get('limit')).toBe('20');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Title 21');
    expect(at(requests, 1).searchParams.get('before')).toBe(id(20));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('marks a tapped unread row read, refreshes the counts once and opens its link', async () => {
    answerList([[item(1, { url: '/profile/applications/app_1' })]]);
    const bodies = answerRead();
    render(<NotificationList />);
    fireEvent.click(await screen.findByRole('link', { name: /Title 1/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile/applications/app_1'));
    expect(bodies).toEqual([{ ids: [id(1)] }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  });

  it('marks a row with no link read without going anywhere', async () => {
    answerList([[item(1)]]);
    const bodies = answerRead();
    render(<NotificationList />);
    fireEvent.click(await screen.findByRole('button', { name: /Title 1/ }));
    await waitFor(() => expect(bodies).toEqual([{ ids: [id(1)] }]));
    expect(push).not.toHaveBeenCalled();
  });

  it('opens a read row without marking it again', async () => {
    answerList([[item(1, { read: true, url: '/inbox' })]], 0);
    const bodies = answerRead();
    render(<NotificationList />);
    fireEvent.click(await screen.findByRole('link', { name: /Title 1/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/inbox'));
    expect(bodies).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends 'all' for Mark all as read, then refreshes the counts", async () => {
    answerList([[item(1), item(2)]], 2);
    const bodies = answerRead();
    render(<NotificationList />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(bodies).toEqual([{ ids: 'all' }]));
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());
  });

  it('says so when there are none yet', async () => {
    answerList([[]], 0);
    render(<NotificationList />);
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('shows an error with Retry when the list fails, and recovers', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl('/api/v1/notifications'), () =>
        fail
          ? HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 })
          : HttpResponse.json({ items: [item(1)], nextBefore: null, unread: 1 }),
      ),
    );
    render(<NotificationList />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load your notifications");
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Title 1')).toBeInTheDocument();
  });
});

describe('NotificationList accessibility', () => {
  it('has no serious or critical axe violations loading, listed, empty or failed', async () => {
    answerList([[item(1, { url: '/inbox' }), item(2, { read: true })]]);
    const listed = render(<NotificationList />);
    expect(await seriousOrCritical(listed.container)).toEqual([]);
    await screen.findByText('Title 1');
    expect(await seriousOrCritical(listed.container)).toEqual([]);
    listed.unmount();

    answerList([[]], 0);
    const empty = render(<NotificationList />);
    await screen.findByText('No notifications yet.');
    expect(await seriousOrCritical(empty.container)).toEqual([]);
    empty.unmount();

    server.use(
      http.get(apiUrl('/api/v1/notifications'), () =>
        HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 }),
      ),
    );
    const failed = render(<NotificationList />);
    await screen.findByRole('alert');
    expect(await seriousOrCritical(failed.container)).toEqual([]);
  });
});
