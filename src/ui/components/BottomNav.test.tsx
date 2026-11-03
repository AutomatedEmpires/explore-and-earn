// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Compass, GalleryHorizontal, Map, User } from '@/ui/icons';
import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  it('marks the active item with aria-current="page"', () => {
    render(
      <BottomNav
        label="Main"
        items={[
          { href: '/', label: 'Seek', icon: Compass, current: true },
          { href: '/swipe', label: 'Swipe', icon: GalleryHorizontal },
          { href: '/map', label: 'Map', icon: Map },
          { href: '/profile', label: 'Profile', icon: User, attention: true },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Seek' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Swipe', 'Map']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByRole('link', { name: 'Profile, needs attention' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });
});
