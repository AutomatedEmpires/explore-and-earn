// @vitest-environment jsdom
// The operator console's frame. An operator without a passkey gets a bare frame around the
// passkey page; it still needs a way out, for someone who cannot add a passkey on this device.
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const viewer = vi.hoisted(() => ({
  current: { state: 'needs_passkey' } as { state: 'needs_passkey' } | { state: 'ok' },
}));

vi.mock('./_lib/session', () => ({ consoleViewer: async () => viewer.current }));

vi.mock('@/lib/env', () => ({ getEnv: () => ({ APP_ENV: 'dev' }) }));

const signOut = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children, redirectUrl }: { children: ReactNode; redirectUrl?: string }) => (
    <span data-sign-out={redirectUrl} onClickCapture={() => signOut(redirectUrl)}>
      {children}
    </span>
  ),
}));

// The full console navigation is not what this checks.
vi.mock('./_components/ConsoleNav', () => ({
  ConsoleNav: () => <nav aria-label="Console" />,
}));

const { default: AdminLayout } = await import('./layout');

describe('AdminLayout', () => {
  it('offers Sign out beside the wordmark while a passkey is missing', async () => {
    render(await AdminLayout({ children: <h1>Add a passkey</h1> }));

    const header = screen.getByRole('banner');
    const button = within(header).getByRole('button', { name: 'Sign out' });
    expect(button).toBeEnabled();
    button.click();
    expect(signOut).toHaveBeenCalledWith('/sign-in');
    expect(screen.getByRole('heading', { name: 'Add a passkey' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Console' })).not.toBeInTheDocument();
  });
});
