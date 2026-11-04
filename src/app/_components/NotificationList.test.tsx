// @vitest-environment jsdom
// The notifications list (seeker and host). jsdom has no layout, so the 44 px touch target
// (plan, Global Constraints) is checked through the classes that give it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '@/modules/notifications';
import { Bell } from '@/ui/icons';
import { NotificationList } from './NotificationList';

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: '00000000-0000-7000-8000-000000000001',
  type: 'system.test',
  category: 'account',
  title: 'Your listing was approved',
  body: 'Line cook at Kettle Ridge Lodge is live.',
  url: '/host/listings',
  data: {},
  readAt: null,
  createdAt: new Date('2026-11-01T15:00:00Z'),
  ...over,
});

describe('NotificationList', () => {
  it('makes each title link at least 44 px tall', () => {
    render(<NotificationList items={[item({})]} icon={Bell} emptyDescription="Nothing yet." />);
    const link = screen.getByRole('link', { name: 'Your listing was approved' });
    expect(link).toHaveAttribute('href', '/host/listings');
    expect(link).toHaveClass('inline-flex', 'min-h-11', 'items-center');
  });

  it('marks unread items for screen readers and shows an empty state', () => {
    const { unmount } = render(
      <NotificationList
        items={[item({}), item({ id: '00000000-0000-7000-8000-000000000002', url: null })]}
        icon={Bell}
        emptyDescription="Nothing yet."
      />,
    );
    expect(screen.getAllByText('Unread')).toHaveLength(2);
    unmount();

    render(<NotificationList items={[]} icon={Bell} emptyDescription="Nothing yet." />);
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
  });
});
