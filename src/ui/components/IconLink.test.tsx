// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bell, Inbox } from '@/ui/icons';
import { IconLink } from './IconLink';

describe('IconLink', () => {
  it('is a named link whose count is shown but not read twice', () => {
    render(
      <IconLink href="/notifications" label="Notifications, 3 unread" icon={Bell} badge={3} />,
    );
    const link = screen.getByRole('link', { name: 'Notifications, 3 unread' });
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link).toHaveTextContent('3');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the current page and caps the badge at 99+', () => {
    render(<IconLink href="/inbox" label="Inbox" icon={Inbox} badge={120} current />);
    const link = screen.getByRole('link', { name: 'Inbox' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveTextContent('99+');
  });
});
