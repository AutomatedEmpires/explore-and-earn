// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListingError from '../[id]/error';
import { ActionBar, ListingActionsProvider, type ListingActionsInit } from './listing-actions';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const init: ListingActionsInit = {
  listingId: ID,
  title: 'Lodge housekeeper',
  source: 'other',
  seeker: false,
  disposition: null,
  applied: false,
  applyHref: `/sign-in?redirect_url=${encodeURIComponent(`/apply/${ID}?source=other`)}`,
  signInHref: `/sign-in?redirect_url=${encodeURIComponent(`/jobs/view/${ID}/lodge-housekeeper`)}`,
};

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('the action bar for a guest', () => {
  it('links Apply through sign-in and records one view', () => {
    render(
      <ListingActionsProvider init={init}>
        <ActionBar />
        <ActionBar />
      </ListingActionsProvider>,
    );
    const applies = screen.getAllByRole('link', { name: 'Apply' });
    expect(applies[0]).toHaveAttribute('href', init.applyHref);
    const views = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/events'));
    expect(views).toHaveLength(1);
  });

  it('sends Save and Skip to sign-in, and gives each bar its own hint id', () => {
    render(
      <ListingActionsProvider init={init}>
        <ActionBar />
        <ActionBar />
      </ListingActionsProvider>,
    );
    const saves = screen.getAllByRole('button', { name: 'Save' });
    expect(saves[0]).not.toHaveAttribute('aria-pressed');
    const hints = saves.map((b) => b.getAttribute('aria-describedby'));
    expect(new Set(hints).size).toBe(2);
    fireEvent.click(saves[0] as HTMLElement);
    expect(push).toHaveBeenCalledWith(init.signInHref);
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip' })[0] as HTMLElement);
    expect(push).toHaveBeenCalledTimes(2);
  });
});

describe('the action bar for a seeker', () => {
  it('saves with the API and shows the pressed state in both bars', async () => {
    render(
      <ListingActionsProvider init={{ ...init, seeker: true, applyHref: `/apply/${ID}` }}>
        <ActionBar />
        <ActionBar />
      </ListingActionsProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement);
    await waitFor(() =>
      screen
        .getAllByRole('button', { name: 'Save' })
        .forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'true')),
    );
    const put = fetchMock.mock.calls.find(([url]) => String(url).includes('/dispositions/'));
    expect(put?.[1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      state: 'saved',
      source: 'other',
      expectedState: null,
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('says when the job just closed', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/dispositions/')
        ? Response.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 })
        : new Response(null, { status: 204 }),
    );
    render(
      <ListingActionsProvider init={{ ...init, seeker: true }}>
        <ActionBar />
      </ListingActionsProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This job just closed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('the listing error boundary', () => {
  it('shows "Couldn’t load this job" with Try again', () => {
    const retry = vi.fn();
    render(<ListingError error={new Error('x')} retry={retry} />);
    expect(screen.getByRole('heading', { name: 'Couldn’t load this job' })).toBeInTheDocument();
    // The page's metadata failed with it, so the boundary names the document (axe document-title).
    expect(document.title).toBe('Couldn’t load this job · Explore&Earn');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('switches to the offline view and tries again once back online', () => {
    const retry = vi.fn();
    render(<ListingError error={new Error('x')} retry={retry} />);
    act(() => setOnline(false));
    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument();
    expect(document.title).toBe('You’re offline · Explore&Earn');
    expect(retry).not.toHaveBeenCalled();
    act(() => setOnline(true));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Couldn’t load this job' })).toBeInTheDocument();
  });
});
