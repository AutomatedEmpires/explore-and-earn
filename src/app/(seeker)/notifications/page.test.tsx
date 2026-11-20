// @vitest-environment jsdom
// /notifications (issue 224): the seeker's page signs them in, then shows the heading and the
// W7 NotificationList (#145), which loads GET /api/v1/notifications itself, 20 a page, and offers
// "Mark all as read". axe runs over the loaded and empty states; jsdom has no layout, so color
// contrast is left to src/ui/tokens.test.ts and the Playwright run.
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';

const seekerPage = vi.fn();
vi.mock('@/server/shell', () => ({
  seekerPage: (...args: unknown[]) => seekerPage(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { default: NotificationsPage } = await import('./page');
const { seriousOrCritical } = await import('@/app/_features/safety/axe-test-helper');

setupMswServer();

const ITEM = {
  id: '019a4a3c-0000-7000-8000-000000000001',
  type: 'applications.status_changed',
  category: 'applications',
  title: 'Kettle Ridge Lodge viewed your application',
  body: 'Lodge housekeeper',
  data: {},
  url: null,
  readAt: null,
  createdAt: new Date().toISOString(),
};

function answer(items: (typeof ITEM)[], unread: number) {
  const requests: URL[] = [];
  server.use(
    http.get(apiUrl('/api/v1/notifications'), ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items, nextBefore: null, unread });
    }),
  );
  return requests;
}

beforeEach(() => {
  seekerPage.mockReset();
  seekerPage.mockResolvedValue({ id: 'user_1', accountType: 'seeker' });
});

describe('/notifications, seeker', () => {
  it('signs the seeker in, then shows the heading and the W7 list', async () => {
    const requests = answer([ITEM], 1);
    const { container } = render(await NotificationsPage());
    expect(seekerPage).toHaveBeenCalledWith('/notifications', { guests: false });
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();

    expect(
      await screen.findByRole('button', { name: /Kettle Ridge Lodge viewed your application/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeInTheDocument();
    expect(requests.map((u) => u.searchParams.get('limit'))).toEqual(['20']);
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('shows the list’s empty state', async () => {
    answer([], 0);
    const { container } = render(await NotificationsPage());
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
