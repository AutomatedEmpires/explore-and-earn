// @vitest-environment jsdom
// Flow D's Applicants in jsdom, against a fetch stub that answers like the SP5 API: the Reply link,
// Pass in one tap with its Undo, Shortlist, and every state (loading, couldn't load, offline,
// none yet, caught up, no access). axe runs over each state; jsdom has no layout, so color
// contrast is left to src/ui/tokens.test.ts and the Playwright run (tests/e2e/flow-d-*).
import { createRequire } from 'node:module';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantCardData } from '@/lib/hiring';
import { applicantsQuerySchema } from '@/lib/hiring';
import { appliedDaysAgo } from '../_lib/model';
import { SAMPLE_IDS, SAMPLE_ORG, sampleApplicant, sampleSecondApplicant } from '../_lib/sample';
import { ApplicantsScreen } from './ApplicantsScreen';

// "Applied today" counts calendar days on this device's clock, so every test starts at a fixed
// midday: the cards read the same whatever the hour, time zone or daylight-saving change on the
// machine running them. Only Date is faked; timers stay real and the clock moves on from there.
const MIDDAY = new Date(2026, 10, 18, 12);

type Violation = { id: string; impact: string | null; nodes: { target: string[] }[] };
type Axe = { run(context: Element, options: object): Promise<{ violations: Violation[] }> };

// axe-core ships with @axe-core/playwright; load it from there rather than add a dependency.
const local = createRequire(import.meta.url);
const axe = createRequire(local.resolve('@axe-core/playwright'))('axe-core') as Axe;

async function seriousOrCritical(container: Element): Promise<string[]> {
  const { violations } = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, code: string, reason?: string): Response {
  return json({ error: { code, message: 'No', details: reason ? { reason } : undefined } }, status);
}

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };

/** A fetch stub with the applicants API; `routes` overrides one answer. */
function install(o: {
  items?: ApplicantCardData[];
  list?: () => Response | Promise<Response>;
  pass?: () => Response;
  undo?: () => Response;
  undoMs?: number;
}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ method, path: url.pathname, query: url.searchParams, body });
    if (url.pathname === '/api/v1/host/applicants' && method === 'GET') {
      if (o.list) return o.list();
      return json({ items: o.items ?? [sampleApplicant()], counts: {}, nextCursor: null });
    }
    if (url.pathname.endsWith('/pass/undo')) return o.undo ? o.undo() : json({ status: 'new' });
    if (url.pathname.endsWith('/pass')) {
      if (o.pass) return o.pass();
      return json({ undoUntil: new Date(Date.now() + (o.undoMs ?? 10_000)).toISOString() });
    }
    if (url.pathname.endsWith('/shortlist')) {
      const on = (body as { on: boolean }).on;
      return json({ status: on ? 'shortlisted' : 'new' });
    }
    return failure(404, 'not_found');
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderScreen() {
  return render(
    <main>
      <ApplicantsScreen orgName={SAMPLE_ORG} replyBase="/host/messages" />
    </main>,
  );
}

function card(name: string): HTMLElement {
  const link = screen.getByRole('link', { name });
  const article = link.closest('article');
  if (!article) throw new Error(`no card for ${name}`);
  return article;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(MIDDAY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Applicants: answering', () => {
  it('lists the applicants waiting on a reply, with Reply linked to the reply step', async () => {
    const calls = install({});
    const { container } = renderScreen();
    expect(screen.getByRole('status', { name: 'Loading applicants' })).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);

    const maya = await screen.findByRole('link', { name: 'Maya Chen' });
    expect(screen.getByRole('heading', { level: 1, name: 'Applicants' })).toBeInTheDocument();
    expect(screen.getByText('Answer within a day to keep your reply time short.')).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_ORG)).toBeInTheDocument();
    expect(maya).toHaveAttribute(
      'href',
      `/api/v1/host/applications/${SAMPLE_IDS.application}/resume.pdf`,
    );
    const article = card('Maya Chen');
    expect(within(article).getByText('Applied today')).toBeInTheDocument();
    expect(within(article).getByText('· Applied for Lodge Cook')).toBeInTheDocument();
    expect(within(article).getByText('Available May 10, 2027')).toBeInTheDocument();
    expect(within(article).getByText('9 listed')).toBeInTheDocument();
    // Reply is a link, so the reply step is one tap away and Send reply is the second.
    expect(within(article).getByRole('link', { name: 'Reply' })).toHaveAttribute(
      'href',
      `/host/messages/${SAMPLE_IDS.thread}/reply`,
    );
    for (const name of ['Pass', 'Shortlist']) {
      expect(within(article).getByRole('button', { name })).toHaveClass('size-12');
    }
    expect(await seriousOrCritical(container)).toEqual([]);

    // The query passes the server schema, read the way apiRoute reads a query string.
    const list = calls.find((c) => c.path === '/api/v1/host/applicants');
    const read = Object.fromEntries(
      [...new Set(list?.query.keys())].map((k) => {
        const v = list?.query.getAll(k) ?? [];
        return [k, v.length === 1 ? v[0] : v];
      }),
    );
    expect(applicantsQuerySchema.parse(read).status).toEqual(['new', 'shortlisted']);
  });

  it('shows — for fit when it is off and initials when there is no photo', async () => {
    install({ items: [sampleSecondApplicant()] });
    renderScreen();
    await screen.findByRole('link', { name: 'Jordan Reyes' });
    const article = card('Jordan Reyes');
    expect(within(article).getByText('—')).toBeInTheDocument();
    expect(within(article).getByText('JR')).toBeInTheDocument();
    expect(within(article).getByText('Applied 3 days ago')).toBeInTheDocument();
  });

  it('Pass is one tap: the card leaves, a toast offers Undo, and Undo brings it back', async () => {
    const calls = install({});
    const { container } = renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });

    fireEvent.click(within(card('Maya Chen')).getByRole('button', { name: 'Pass' }));
    expect(await screen.findByText('Maya Chen passed')).toBeInTheDocument();
    expect(screen.getByText('Maya won’t be told for 10 seconds.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'You’re caught up' })).toBeInTheDocument();
    expect(screen.getByText('No one else is waiting on a reply for Lodge Cook.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Maya Chen' })).toBeNull();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      `/api/v1/host/applicants/${SAMPLE_IDS.application}/pass`,
    ]);
    expect(await seriousOrCritical(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('link', { name: 'Maya Chen' })).toBeInTheDocument();
    expect(await screen.findByText('Maya Chen is back on your list')).toBeInTheDocument();
    expect(screen.queryByText('Maya Chen passed')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      `/api/v1/host/applicants/${SAMPLE_IDS.application}/pass`,
      `/api/v1/host/applicants/${SAMPLE_IDS.application}/pass/undo`,
    ]);
  });

  it('closes the Undo when the server’s window ends, and the pass stands', async () => {
    install({ items: [sampleApplicant(), sampleSecondApplicant()], undoMs: 300 });
    renderScreen();
    await screen.findByRole('link', { name: 'Jordan Reyes' });
    fireEvent.click(within(card('Jordan Reyes')).getByRole('button', { name: 'Pass' }));
    expect(await screen.findByText('Jordan Reyes passed')).toBeInTheDocument();
    // Maya is still waiting, so this is not the caught-up state.
    expect(screen.getByRole('link', { name: 'Maya Chen' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Jordan Reyes passed')).toBeNull(), {
      timeout: 2_000,
    });
    expect(screen.queryByRole('link', { name: 'Jordan Reyes' })).toBeNull();
  });

  it('says when the Undo came too late, and keeps the card off the list', async () => {
    install({ undo: () => failure(409, 'conflict', 'undo_expired') });
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    fireEvent.click(within(card('Maya Chen')).getByRole('button', { name: 'Pass' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Too late to undo')).toBeInTheDocument();
    expect(screen.getByText('Maya was passed.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Maya Chen' })).toBeNull();
  });

  it('puts the card back when a pass fails', async () => {
    install({ pass: () => failure(500, 'internal') });
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    fireEvent.click(within(card('Maya Chen')).getByRole('button', { name: 'Pass' }));
    expect(await screen.findByText('Couldn’t pass Maya Chen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Maya Chen' })).toBeInTheDocument();
  });

  it('Shortlist marks the card and sends on: true', async () => {
    const calls = install({});
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    const shortlist = within(card('Maya Chen')).getByRole('button', { name: 'Shortlist' });
    expect(shortlist).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(shortlist);
    });
    expect(shortlist).toHaveAttribute('aria-pressed', 'true');
    expect(calls.find((c) => c.path.endsWith('/shortlist'))?.body).toEqual({ on: true });
  });

  it('tells the host when a conversation isn’t ready instead of linking nowhere', async () => {
    install({ items: [{ ...sampleApplicant(), threadId: null }] });
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    fireEvent.click(within(card('Maya Chen')).getByRole('button', { name: 'Reply' }));
    expect(await screen.findByText('Maya Chen’s conversation isn’t ready yet')).toBeInTheDocument();
  });
});

describe('Applicants: states', () => {
  it('couldn’t load, then a retry', async () => {
    let fail = true;
    install({
      list: () =>
        fail
          ? failure(500, 'internal')
          : json({ items: [sampleApplicant()], counts: {}, nextCursor: null }),
    });
    const { container } = renderScreen();
    expect(await screen.findByRole('heading', { name: 'We couldn’t load applicants' })).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Maya Chen' })).toBeInTheDocument();
  });

  it('offline: the frame’s message and Try again, without the page title', async () => {
    install({
      list: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { container } = renderScreen();
    expect(await screen.findByRole('heading', { level: 1, name: 'You are offline' })).toBeInTheDocument();
    expect(screen.getByText('Applicants will load when you are back.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Applicants' })).toBeNull();
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('no applicants yet', async () => {
    install({ items: [] });
    const { container } = renderScreen();
    expect(await screen.findByRole('heading', { name: 'No applicants yet' })).toBeInTheDocument();
    expect(screen.getByText('Share your listing or invite candidates.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Share listing' })).toHaveAttribute('href', '/host/listings');
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('a role without access (403) says so', async () => {
    install({ list: () => failure(403, 'forbidden', 'role_not_allowed') });
    const { container } = renderScreen();
    expect(
      await screen.findByRole('heading', { name: 'Applicants are hidden for your role' }),
    ).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('leaves out applicants whose pass is still pending', async () => {
    install({
      items: [
        { ...sampleSecondApplicant(), undoUntil: new Date(Date.now() + 5_000).toISOString() },
        sampleApplicant(),
      ],
    });
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    expect(screen.queryByRole('link', { name: 'Jordan Reyes' })).toBeNull();
  });
});

// The day turns over at midnight on this device's clock (local time; UTC on the CI runner).
describe('Applicants: the calendar-day boundary', () => {
  const midnight = new Date(2026, 10, 18);
  const justBefore = new Date(midnight.getTime() - 1);

  it('reads Applied today in the first hour after midnight', async () => {
    vi.setSystemTime(new Date(2026, 10, 18, 0, 30));
    install({});
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    expect(within(card('Maya Chen')).getByText('Applied today')).toBeInTheDocument();
  });

  it('reads Applied today a minute before midnight', async () => {
    vi.setSystemTime(new Date(2026, 10, 17, 23, 59));
    install({});
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    expect(within(card('Maya Chen')).getByText('Applied today')).toBeInTheDocument();
  });

  it('a minute after midnight, 23:59 was a day ago and 00:00 is today', async () => {
    vi.setSystemTime(new Date(2026, 10, 18, 0, 1));
    install({
      items: [
        { ...sampleApplicant(), appliedAt: new Date(2026, 10, 17, 23, 59).toISOString() },
        { ...sampleSecondApplicant(), appliedAt: midnight.toISOString() },
      ],
    });
    renderScreen();
    await screen.findByRole('link', { name: 'Maya Chen' });
    expect(within(card('Maya Chen')).getByText('Applied 1 day ago')).toBeInTheDocument();
    expect(within(card('Jordan Reyes')).getByText('Applied today')).toBeInTheDocument();
  });

  it('appliedDaysAgo turns over at midnight, to the millisecond', () => {
    expect(appliedDaysAgo(justBefore.toISOString(), midnight)).toBe(1);
    expect(appliedDaysAgo(midnight.toISOString(), midnight)).toBe(0);
    expect(appliedDaysAgo(justBefore.toISOString(), justBefore)).toBe(0);
    expect(appliedDaysAgo(new Date(2026, 10, 17).toISOString(), justBefore)).toBe(0);
    expect(appliedDaysAgo(new Date(2026, 10, 17).toISOString(), midnight)).toBe(1);
  });

  it('keeps the sample applicant on the same calendar day as now, either side of midnight', () => {
    const nows = [
      justBefore,
      midnight,
      new Date(2026, 10, 18, 0, 30),
      new Date(2026, 10, 18, 0, 59, 59, 999),
      new Date(2026, 10, 18, 1),
      MIDDAY,
    ];
    for (const now of nows) {
      expect(appliedDaysAgo(sampleApplicant(now).appliedAt, now), now.toISOString()).toBe(0);
    }
    // An hour before now, but never before that day's midnight.
    expect(sampleApplicant(MIDDAY).appliedAt).toBe(new Date(2026, 10, 18, 11).toISOString());
    expect(sampleApplicant(justBefore).appliedAt).toBe(
      new Date(2026, 10, 17, 22, 59, 59, 999).toISOString(),
    );
    expect(sampleApplicant(new Date(2026, 10, 18, 0, 30)).appliedAt).toBe(midnight.toISOString());
  });
});
