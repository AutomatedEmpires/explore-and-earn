// @vitest-environment jsdom
// /host/notifications (issue 224): the host's page signs them in to the workspace, then shows
// the heading and the same W7 NotificationList (#145) as the seeker's page; it has no
// role-specific props. axe runs over the loaded state; jsdom has no layout, so color contrast is
// left to src/ui/tokens.test.ts and the Playwright run.
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';

const hostPage = vi.fn();
vi.mock('@/server/shell', () => ({
  hostPage: (...args: unknown[]) => hostPage(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { default: HostNotificationsPage } = await import('./page');
const { seriousOrCritical } = await import('@/app/_features/safety/axe-test-helper');

setupMswServer();

const ITEM = {
  id: '019a4a3c-0000-7000-8000-000000000002',
  type: 'applications.submitted',
  category: 'applications',
  title: 'Maya Chen applied',
  body: 'Lodge housekeeper',
  data: {},
  url: '/host/applicants',
  readAt: null,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  hostPage.mockReset();
  hostPage.mockResolvedValue({ user: { id: 'user_2' }, orgId: 'org_1' });
});

describe('/host/notifications', () => {
  it('signs the host in, then shows the heading and the W7 list', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(apiUrl('/api/v1/notifications'), ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ items: [ITEM], nextBefore: null, unread: 1 });
      }),
    );
    const { container } = render(await HostNotificationsPage());
    expect(hostPage).toHaveBeenCalledWith('/host/notifications');
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();

    expect(await screen.findByRole('link', { name: /Maya Chen applied/ })).toHaveAttribute(
      'href',
      '/host/applicants',
    );
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeInTheDocument();
    expect(requests.map((u) => u.searchParams.get('limit'))).toEqual(['20']);
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
