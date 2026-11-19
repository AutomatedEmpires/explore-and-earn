// @vitest-environment jsdom
// The EU cookie banner (SP8 plan Task 26, spec 8.4): the exact copy, two equal buttons, a
// region that never traps focus, and a choice that is recorded before the banner goes away.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_BANNER_TEXT, CookieBanner } from './CookieBanner';

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

describe('CookieBanner', () => {
  it('shows the spec copy and two buttons of the same variant and size to an EU visitor', () => {
    render(<CookieBanner region="eu" state="unset" />);
    const region = screen.getByRole('region', { name: 'Cookie choices' });
    expect(region).toHaveTextContent(
      'We use cookies to keep you signed in. With your OK, we also use analytics cookies to see how Explore&Earn is used so we can improve it. We never sell your data.',
    );
    expect(COOKIE_BANNER_TEXT).toBe(
      'We use cookies to keep you signed in. With your OK, we also use analytics cookies to see how Explore&Earn is used so we can improve it. We never sell your data.',
    );
    const accept = screen.getByRole('button', { name: 'Accept analytics' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(accept.className).toBe(reject.className);
    expect(screen.getByRole('link', { name: 'Cookie settings' })).toHaveAttribute(
      'href',
      '/legal/cookies#settings',
    );
  });

  it('is not shown outside the EU, or once the visitor has chosen', () => {
    const { rerender } = render(<CookieBanner region="other" state="unset" />);
    expect(screen.queryByRole('region', { name: 'Cookie choices' })).toBeNull();
    rerender(<CookieBanner region="eu" state="granted" />);
    expect(screen.queryByRole('region', { name: 'Cookie choices' })).toBeNull();
    rerender(<CookieBanner region="eu" state="denied" />);
    expect(screen.queryByRole('region', { name: 'Cookie choices' })).toBeNull();
  });

  it('records Accept, loads analytics and hides', async () => {
    render(<CookieBanner region="eu" state="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Cookie choices' })).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/consent',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ analytics: true }) }),
    );
    expect(analytics.grant).toHaveBeenCalledTimes(1);
    expect(analytics.revoke).not.toHaveBeenCalled();
  });

  it('records Reject and keeps analytics off', async () => {
    render(<CookieBanner region="eu" state="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Cookie choices' })).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/consent',
      expect.objectContaining({ body: JSON.stringify({ analytics: false }) }),
    );
    expect(analytics.grant).not.toHaveBeenCalled();
  });

  it('stays, without loading analytics, when the choice could not be saved', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    render(<CookieBanner region="eu" state="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Please try again.');
    expect(screen.getByRole('region', { name: 'Cookie choices' })).toBeInTheDocument();
    expect(analytics.grant).not.toHaveBeenCalled();
  });

  it('does not trap focus: Tab leaves the banner for the page', () => {
    render(
      <>
        <CookieBanner region="eu" state="unset" />
        <button type="button">Next on the page</button>
      </>,
    );
    const region = screen.getByRole('region', { name: 'Cookie choices' });
    expect(region).not.toHaveAttribute('aria-modal');
    const last = screen.getByRole('link', { name: 'Cookie settings' });
    last.focus();
    // Nothing in the banner stops the browser's own Tab handling.
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);
    const next = screen.getByRole('button', { name: 'Next on the page' });
    expect(next).not.toHaveAttribute('inert');
    next.focus();
    expect(document.activeElement).toBe(next);
  });
});
