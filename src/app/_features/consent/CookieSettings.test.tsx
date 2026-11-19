// @vitest-environment jsdom
// Cookie settings (SP8 plan Task 26, spec 8.4): one switch, saved in any region.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieSettings } from './CookieSettings';

const analytics = vi.hoisted(() => ({ grant: vi.fn(), revoke: vi.fn() }));
vi.mock('@/lib/analytics-client', () => ({
  grantAnalyticsConsent: analytics.grant,
  revokeAnalyticsConsent: analytics.revoke,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  analytics.grant.mockClear();
  analytics.revoke.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ consentId: 'c' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CookieSettings', () => {
  it('starts off for a visitor who has not chosen, and saves an acceptance', async () => {
    render(<CookieSettings analytics={null} />);
    const toggle = screen.getByRole('switch', { name: 'Analytics cookies' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Your choice is saved.'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/consent',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ analytics: true }) }),
    );
    expect(analytics.grant).toHaveBeenCalledTimes(1);
  });

  it('saves a refusal and stops analytics', async () => {
    render(<CookieSettings analytics={true} />);
    const toggle = screen.getByRole('switch', { name: 'Analytics cookies' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(analytics.revoke).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/consent',
      expect.objectContaining({ body: JSON.stringify({ analytics: false }) }),
    );
    expect(analytics.grant).not.toHaveBeenCalled();
  });

  it('says so, and changes nothing, when the choice could not be saved', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<CookieSettings analytics={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Please try again.'));
    expect(analytics.grant).not.toHaveBeenCalled();
    expect(analytics.revoke).not.toHaveBeenCalled();
  });
});
