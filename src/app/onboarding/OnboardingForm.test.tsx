// @vitest-environment jsdom
// The onboarding form (design audit 1):
//   C-1: it sends the guest's `returnTo` and finishes where the API says, never off-site.
//   C-3: the step is in the URL, so the browser's Back button moves between steps, and a
//        refresh or a link opens the same step.
//   C-2: each step's paragraph is 16 px body text.
//   Legal review 2.6 (P0 item 17): the seeker step asks for the date of birth as a neutral
//   question (#128's approved frames), never hints at the cut-off, and a refusal closes
//   onboarding for the session.
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
const signOut = vi.hoisted(() => vi.fn(async (_opts?: { redirectUrl?: string }) => {}));
vi.mock('@clerk/nextjs', () => ({
  useSession: () => ({ session: { getToken } }),
  useClerk: () => ({ signOut }),
}));

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
  signOut.mockClear();
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
const seekerHeading = () => screen.queryByRole('heading', { name: 'What is your date of birth?' });
const refusedHeading = () =>
  screen.queryByRole('heading', { name: 'We can’t make you an account' });

/** Picks the month through the Select's form value, as the browser's autofill does. */
function chooseMonth(value: string) {
  const select = document.querySelector<HTMLSelectElement>('select[name="birthMonth"]');
  if (!select) throw new Error('no month select');
  fireEvent.change(select, { target: { value } });
}

/** Fills in the date of birth: month 1-12, day and year as typed. */
function enterDateOfBirth(month: string, day: string, year: string) {
  if (month) chooseMonth(month);
  fireEvent.change(screen.getByRole('textbox', { name: /^Day/ }), { target: { value: day } });
  fireEvent.change(screen.getByRole('textbox', { name: /^Year/ }), { target: { value: year } });
}

const ADULT = { month: '4', day: '3', year: '1990', iso: '1990-04-03' };
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
    expect(screen.getByText('Choose a month.')).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(chooseHeading()).toBeInTheDocument());
    act(() => window.history.forward());
    await waitFor(() => expect(seekerHeading()).toBeInTheDocument());
    expect(screen.queryByText('Choose a month.')).not.toBeInTheDocument();
  });

  it('shows only the organization step, without Back, for a host who still has to name it', () => {
    visit('/onboarding?step=seeker');
    render(<OnboardingForm hostOnly />);
    expect(hostHeading()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('OnboardingForm: body text is at least 16 px (C-2)', () => {
  it.each([
    ['/onboarding', 'Welcome to Explore&Earn'],
    ['/onboarding?step=seeker', 'What is your date of birth?'],
    ['/onboarding?step=host', 'Name your organization'],
  ])('sets the paragraph under the heading at %s in text-16', (href, title) => {
    visit(href);
    render(<OnboardingForm />);
    const lead = screen.getByRole('heading', { name: title }).nextElementSibling;
    expect(lead?.tagName).toBe('P');
    expect(lead).toHaveClass('text-16');
    expect(lead).not.toHaveClass('text-15');
  });
});

describe("OnboardingForm: the guest's action survives onboarding (C-1)", () => {
  it('sends returnTo and goes where the API answers, after refreshing the session', async () => {
    const fetchMock = respond(200, { redirectTo: JOB });
    visit(`${ONBOARDING_JOB}&step=seeker`);
    render(<OnboardingForm returnTo={JOB} />);

    enterDateOfBirth(ADULT.month, ADULT.day, ADULT.year);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(JOB));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/onboarding', expect.anything());
    expect(sentBody(fetchMock)).toEqual({
      accountType: 'seeker',
      dateOfBirth: ADULT.iso,
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

    enterDateOfBirth(ADULT.month, ADULT.day, ADULT.year);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(sentBody(fetchMock)).toEqual({ accountType: 'seeker', dateOfBirth: ADULT.iso });
  });

  it.each([['https://evil.test/jobs'], ['//evil.test'], ['javascript:alert(1)'], [42], [null]])(
    'stays on this site when the API answers %j',
    async (redirectTo) => {
      respond(200, { redirectTo });
      visit('/onboarding?step=seeker');
      render(<OnboardingForm />);

      enterDateOfBirth(ADULT.month, ADULT.day, ADULT.year);
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    },
  );

  it('lets the page send an already onboarded user on (409)', async () => {
    respond(409, { error: { code: 'conflict', message: 'Account type is already set' } });
    visit(`${ONBOARDING_JOB}&step=seeker`);
    render(<OnboardingForm returnTo={JOB} />);

    enterDateOfBirth(ADULT.month, ADULT.day, ADULT.year);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(nav.replace).not.toHaveBeenCalled();
    // The refreshed page reads returnTo from the URL, which still has it.
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(JOB);
  });
});

describe('OnboardingForm: the date of birth step (legal review 2.6)', () => {
  const REFUSED = {
    error: {
      code: 'forbidden',
      message: 'We can’t make you an account',
      details: { reason: 'signup_refused' },
      requestId: 'req-1',
    },
  };

  it('asks a neutral question, keeps only the year, and never shows an age', () => {
    visit('/onboarding?step=seeker');
    const { container } = render(<OnboardingForm />);

    expect(seekerHeading()).toBeInTheDocument();
    expect(
      screen.getByText('We ask everyone who makes an account. We keep only the year.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Date of birth' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Month/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Day/ })).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('textbox', { name: /^Year/ })).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByText('You never pay to get a job.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    // No hint at the cut-off anywhere on the step.
    expect(container.textContent).not.toMatch(/\b18\b|adult|or older|\bage\b/i);
  });

  it('checks the date in place and keeps what was typed', () => {
    const fetchMock = respond(200, { redirectTo: '/' });
    visit('/onboarding?step=seeker');
    render(<OnboardingForm />);

    enterDateOfBirth('4', '3', '01');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter all 4 numbers, like 1998.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Year/ })).toHaveValue('01');
    expect(screen.getByRole('textbox', { name: /^Year/ })).toHaveAttribute('aria-invalid', 'true');

    enterDateOfBirth('2', '30', '2001');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a real date.')).toBeInTheDocument();

    enterDateOfBirth('4', '', '2001');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter the day, like 3.')).toBeInTheDocument();

    enterDateOfBirth('4', '3', String(new Date().getFullYear() + 1));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a date before today.')).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pads the date it sends: 4 / 3 / 2001 is 2001-04-03', async () => {
    const fetchMock = respond(200, { redirectTo: '/' });
    visit('/onboarding?step=seeker');
    render(<OnboardingForm />);

    enterDateOfBirth('4', '03', '2001');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchMock)).toEqual({ accountType: 'seeker', dateOfBirth: '2001-04-03' });
  });

  it('shows the refusal with no way to try again, and Back to jobs signs out', async () => {
    respond(403, REFUSED);
    visit('/onboarding?step=seeker');
    const { container } = render(<OnboardingForm />);

    enterDateOfBirth('6', '1', '2015');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(refusedHeading()).toBeInTheDocument());
    expect(refusedHeading()).toHaveFocus();
    expect(screen.getByText('You can still look at jobs without an account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Date of birth' })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b18\b|adult|or older|\bage\b|try again/i);

    // Both ways out end the session first: a signed-in account with no type is sent back to
    // onboarding from any page.
    fireEvent.click(screen.getByRole('button', { name: 'Back to jobs' }));
    expect(signOut).toHaveBeenLastCalledWith({ redirectUrl: '/' });
    fireEvent.click(screen.getByRole('button', { name: 'Read the Terms' }));
    expect(signOut).toHaveBeenLastCalledWith({ redirectUrl: '/legal/terms' });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('opens on the refusal when the session was already refused, at any step', () => {
    visit('/onboarding?step=host');
    render(<OnboardingForm refused />);
    expect(refusedHeading()).toBeInTheDocument();
    expect(hostHeading()).not.toBeInTheDocument();
  });

  it('keeps the date while offline, and sends it again from Try again', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        throw new TypeError('Failed to fetch');
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    visit('/onboarding?step=seeker');
    render(<OnboardingForm />);

    enterDateOfBirth(ADULT.month, ADULT.day, ADULT.year);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'You are offline' })).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Your date of birth is saved on this phone. Try again when you are back.'),
    ).toBeInTheDocument();

    onLine.mockReturnValue(true);
    fetchMock.mockImplementation(async () => Response.json({ redirectTo: '/' }, { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      accountType: 'seeker',
      dateOfBirth: ADULT.iso,
    });
    onLine.mockRestore();
  });
});
