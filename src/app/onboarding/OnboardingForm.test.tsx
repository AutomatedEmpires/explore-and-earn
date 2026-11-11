// @vitest-environment jsdom
// The onboarding form (design audit 1):
//   C-1: it sends the guest's `returnTo` and finishes where the API says, never off-site.
//   C-3: the step is in the URL, so the browser's Back button moves between steps, and a
//        refresh or a link opens the same step.
//
// Next.js syncs the native History API into useSearchParams; the mock below does the same from
// jsdom's location, so the form is driven through real pushState, replaceState and popstate.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingForm } from './OnboardingForm';

const nav = vi.hoisted(() => ({
  replace: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
  back: vi.fn<() => void>(),
  listeners: new Set<() => void>(),
}));

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (onChange: () => void) => {
    nav.listeners.add(onChange);
    return () => nav.listeners.delete(onChange);
  };
  return {
    useRouter: () => ({
      replace: nav.replace,
      refresh: nav.refresh,
      back: nav.back,
      push: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  };
});

const getToken = vi.hoisted(() => vi.fn(async () => 'token'));
vi.mock('@clerk/nextjs', () => ({ useSession: () => ({ session: { getToken } }) }));

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';
const ONBOARDING_JOB = `/onboarding?returnTo=${encodeURIComponent(JOB)}`;

const notify = () => {
  for (const listener of nav.listeners) listener();
};
const { pushState, replaceState } = window.history;

beforeEach(() => {
  nav.replace.mockReset();
  nav.refresh.mockReset();
  nav.back.mockReset();
  getToken.mockClear();
  // Like Next.js: history calls and popstate update useSearchParams.
  window.history.pushState = (...args: Parameters<History['pushState']>) => {
    pushState.apply(window.history, args);
    notify();
  };
  window.history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replaceState.apply(window.history, args);
    notify();
  };
  window.addEventListener('popstate', notify);
  nav.back.mockImplementation(() => window.history.back());
});

afterEach(() => {
  window.history.pushState = pushState;
  window.history.replaceState = replaceState;
  window.removeEventListener('popstate', notify);
  vi.unstubAllGlobals();
});

/** Opens the page at `href`, as a fresh visit (a new history entry). */
function visit(href: string) {
  pushState.call(window.history, null, '', href);
}

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof respond>): unknown {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
}

const chooseHeading = () => screen.queryByRole('heading', { name: 'Welcome to Explore&Earn' });
const seekerHeading = () =>
  screen.queryByRole('heading', { name: 'Work worth going somewhere for.' });
const hostHeading = () => screen.queryByRole('heading', { name: 'Name your organization' });

describe('OnboardingForm: the step is in the URL (C-3)', () => {
  it('puts the chosen step in the URL and keeps returnTo', () => {
    visit(ONBOARDING_JOB);
    render(<OnboardingForm returnTo={JOB} />);
    expect(chooseHeading()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /I'm looking for work/ }));

    expect(seekerHeading()).toBeInTheDocument();
    expect(window.location.pathname).toBe('/onboarding');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('step')).toBe('seeker');
    expect(params.get('returnTo')).toBe(JOB);
  });

  it("returns to the choice with the browser's Back button, and forward again", async () => {
    visit('/onboarding');
    render(<OnboardingForm />);
    fireEvent.click(screen.getByRole('button', { name: /I'm hiring/ }));
    expect(hostHeading()).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(chooseHeading()).toBeInTheDocument());
    expect(window.location.search).toBe('');

    act(() => window.history.forward());
    await waitFor(() => expect(hostHeading()).toBeInTheDocument());
    expect(window.location.search).toBe('?step=host');
  });

  it('in-card Back goes back in history after a step was chosen', async () => {
    visit(ONBOARDING_JOB);
    render(<OnboardingForm returnTo={JOB} />);
    fireEvent.click(screen.getByRole('button', { name: /I'm looking for work/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(nav.back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chooseHeading()).toBeInTheDocument());
    expect(window.location.pathname + window.location.search).toBe(ONBOARDING_JOB);
  });

  it('opens at the step a URL names, as after a refresh', () => {
    visit(`${ONBOARDING_JOB}&step=seeker`);
    render(<OnboardingForm returnTo={JOB} />);
    expect(seekerHeading()).toBeInTheDocument();
  });

  it('in-card Back replaces a step that was opened directly with the choice', () => {
    visit(`${ONBOARDING_JOB}&step=host`);
    const before = window.history.length;
    render(<OnboardingForm returnTo={JOB} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(nav.back).not.toHaveBeenCalled();
    expect(chooseHeading()).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe(ONBOARDING_JOB);
    expect(window.history.length).toBe(before);
  });

  it('reads an unknown step as the choice', () => {
    visit('/onboarding?step=operator');
    render(<OnboardingForm />);
    expect(chooseHeading()).toBeInTheDocument();
  });

  it("clears the last step's error when the step changes", async () => {
    visit('/onboarding');
    render(<OnboardingForm />);
    fireEvent.click(screen.getByRole('button', { name: /I'm looking for work/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Confirm you are 18 or older to continue.')).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(chooseHeading()).toBeInTheDocument());
    act(() => window.history.forward());
    await waitFor(() => expect(seekerHeading()).toBeInTheDocument());
    expect(screen.queryByText('Confirm you are 18 or older to continue.')).not.toBeInTheDocument();
  });

  it('shows only the organization step, without Back, for a host who still has to name it', () => {
    visit('/onboarding?step=seeker');
    render(<OnboardingForm hostOnly />);
    expect(hostHeading()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe("OnboardingForm: the guest's action survives onboarding (C-1)", () => {
  it('sends returnTo and goes where the API answers, after refreshing the session', async () => {
    const fetchMock = respond(200, { redirectTo: JOB });
    visit(`${ONBOARDING_JOB}&step=seeker`);
    render(<OnboardingForm returnTo={JOB} />);

    fireEvent.click(screen.getByRole('checkbox', { name: "I'm 18 or older" }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(JOB));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/onboarding', expect.anything());
    expect(sentBody(fetchMock)).toEqual({
      accountType: 'seeker',
      adultAttested: true,
      returnTo: JOB,
    });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(getToken.mock.invocationCallOrder[0]).toBeLessThan(
      nav.replace.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('sends a host to the path the API answers', async () => {
    const fetchMock = respond(200, { redirectTo: '/host/billing' });
    visit('/onboarding?returnTo=%2Fhost%2Fbilling&step=host');
    render(<OnboardingForm returnTo="/host/billing" />);

    fireEvent.change(screen.getByRole('textbox', { name: /^Organization name/ }), {
      target: { value: 'Kettle Ridge Lodge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/host/billing'));
    expect(sentBody(fetchMock)).toEqual({
      accountType: 'host',
      organizationName: 'Kettle Ridge Lodge',
      returnTo: '/host/billing',
    });
  });

  it('sends no returnTo without one', async () => {
    const fetchMock = respond(200, { redirectTo: '/' });
    visit('/onboarding?step=seeker');
    render(<OnboardingForm />);

    fireEvent.click(screen.getByRole('checkbox', { name: "I'm 18 or older" }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(sentBody(fetchMock)).toEqual({ accountType: 'seeker', adultAttested: true });
  });

  it.each([['https://evil.test/jobs'], ['//evil.test'], ['javascript:alert(1)'], [42], [null]])(
    'stays on this site when the API answers %j',
    async (redirectTo) => {
      respond(200, { redirectTo });
      visit('/onboarding?step=seeker');
      render(<OnboardingForm />);

      fireEvent.click(screen.getByRole('checkbox', { name: "I'm 18 or older" }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    },
  );

  it('lets the page send an already onboarded user on (409)', async () => {
    respond(409, { error: { code: 'conflict', message: 'Account type is already set' } });
    visit(`${ONBOARDING_JOB}&step=seeker`);
    render(<OnboardingForm returnTo={JOB} />);

    fireEvent.click(screen.getByRole('checkbox', { name: "I'm 18 or older" }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(nav.replace).not.toHaveBeenCalled();
    // The refreshed page reads returnTo from the URL, which still has it.
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(JOB);
  });
});
