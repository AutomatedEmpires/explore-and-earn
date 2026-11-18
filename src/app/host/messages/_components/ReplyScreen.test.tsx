// @vitest-environment jsdom
// The reply step of flow D in jsdom, against a fetch stub that answers like the SP5 API: the
// ready note, Send reply in one tap, Reply sent, and the states (didn't send and the retry,
// offline, an empty reply, read-only, a thread that isn't there). axe runs over each state; jsdom
// has no layout, so color contrast is left to src/ui/tokens.test.ts and the Playwright run.
import { createRequire } from 'node:module';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READ_ONLY, sendMessageSchema, type ReadOnlyReason } from '@/lib/messaging';
import {
  SAMPLE_IDS,
  SAMPLE_ORG,
  sampleApplicant,
  sampleDetail,
  sampleThread,
} from '../../applicants/_lib/sample';
import { ReplyScreen } from './ReplyScreen';

type Violation = { id: string; impact: string | null; nodes: { target: string[] }[] };
type Axe = { run(context: Element, options: object): Promise<{ violations: Violation[] }> };

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

const DEFAULT_NOTE = 'Thanks for applying. Can you start May 18?';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, code: string, reason?: string): Response {
  return json({ error: { code, message: 'No', details: reason ? { reason } : undefined } }, status);
}

function install(o: {
  thread?: () => Response;
  detail?: () => Response;
  send?: (n: number) => Response;
  readOnly?: ReadOnlyReason;
}) {
  const sent: Record<string, unknown>[] = [];
  const card = sampleApplicant();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? 'GET';
      if (url.pathname === `/api/v1/threads/${SAMPLE_IDS.thread}` && method === 'GET') {
        if (o.thread) return o.thread();
        return json({
          ...sampleThread(card),
          readOnly: o.readOnly ?? null,
          canSend: !o.readOnly,
          cards: {},
        });
      }
      if (url.pathname === `/api/v1/host/applicants/${SAMPLE_IDS.application}`) {
        return o.detail ? o.detail() : json(sampleDetail(card));
      }
      if (url.pathname === `/api/v1/threads/${SAMPLE_IDS.thread}/messages` && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        sent.push(body);
        if (o.send) return o.send(sent.length);
        return json({ message: { id: 'm1', state: 'sending' } });
      }
      return failure(404, 'not_found');
    }),
  );
  return sent;
}

function renderScreen() {
  return render(
    <main>
      <ReplyScreen threadId={SAMPLE_IDS.thread} orgName={SAMPLE_ORG} applicantsHref="/host/applicants" />
    </main>,
  );
}

const replyBox = () => screen.getByRole('textbox', { name: /Your reply/ });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reply: answering', () => {
  it('opens with the ready note and sends it in one tap', async () => {
    const sent = install({});
    const { container } = renderScreen();
    expect(screen.getByRole('status', { name: 'Loading the conversation' })).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This note is ready. Send it, or change the words first.')).toBeInTheDocument();
    expect(replyBox()).toHaveValue(DEFAULT_NOTE);
    expect(screen.getByText('Maya sees this in the app.')).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Maya has your reply' }),
    ).toHaveFocus();
    expect(screen.getByText('Reply sent to Maya Chen.')).toBeInTheDocument();
    expect(
      screen.getByText('Maya can answer in the app. You can write another note from Maya’s card.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to applicants' })).toHaveAttribute(
      'href',
      '/host/applicants',
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBe(DEFAULT_NOTE);
    expect(sendMessageSchema.safeParse(sent[0]).success).toBe(true);
    expect(await seriousOrCritical(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Reply sent to Maya Chen.')).toBeNull();
  });

  it('sends the words as changed, trimmed', async () => {
    const sent = install({});
    renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.change(replyBox(), { target: { value: '  Hi Maya, can you talk Thursday at 10?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByRole('heading', { level: 1, name: 'Maya has your reply' });
    expect(sent.map((s) => s.body)).toEqual(['Hi Maya, can you talk Thursday at 10?']);
  });

  it('never sends an empty reply', async () => {
    const sent = install({});
    const { container } = renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.change(replyBox(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Write a reply first.')).toBeInTheDocument();
    expect(replyBox()).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toHaveLength(0);
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('keeps the first name and a plain note when the applicant detail fails', async () => {
    install({ detail: () => failure(404, 'not_found') });
    renderScreen();
    expect(await screen.findByRole('heading', { level: 1, name: 'Reply to Maya' })).toBeInTheDocument();
    expect(replyBox()).toHaveValue('Thanks for applying. When could you start?');
  });
});

describe('Reply: when it doesn’t go', () => {
  it('didn’t send: the words stay, and the retry carries the same clientId', async () => {
    const sent = install({
      send: (n) => (n === 1 ? failure(500, 'internal') : json({ message: { id: 'm1' } })),
    });
    const { container } = renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your reply didn’t send');
    expect(replyBox()).toHaveValue(DEFAULT_NOTE);
    expect(await seriousOrCritical(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByRole('heading', { level: 1, name: 'Maya has your reply' });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.clientId).toBe(sent[0]?.clientId);
  });

  it('changed words after a failure are a new reply, with a new clientId', async () => {
    const sent = install({
      send: (n) => (n === 1 ? failure(500, 'internal') : json({ message: { id: 'm1' } })),
    });
    renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByRole('alert');
    fireEvent.change(replyBox(), { target: { value: 'Can you start May 20 instead?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByRole('heading', { level: 1, name: 'Maya has your reply' });
    expect(sent[1]?.clientId).not.toBe(sent[0]?.clientId);
  });

  it('offline: says so and keeps the words', async () => {
    install({
      send: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are offline');
    expect(replyBox()).toHaveValue(DEFAULT_NOTE);
  });

  it('a read-only conversation has no composer', async () => {
    install({ readOnly: 'withdrawn' });
    const { container } = renderScreen();
    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    expect(
      screen.getByText('Maya withdrew this application, so you can’t send more messages.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to applicants' })).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('a send refused as read-only turns the screen read-only', async () => {
    install({ send: () => failure(409, 'conflict', 'read_only') });
    renderScreen();
    await screen.findByRole('heading', { level: 1, name: 'Reply to Maya Chen' });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull());
  });

  it('a conversation that isn’t there, or couldn’t load, or offline', async () => {
    install({ thread: () => failure(404, 'not_found') });
    const { container, unmount } = renderScreen();
    expect(
      await screen.findByRole('heading', { name: 'This conversation isn’t available' }),
    ).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
    unmount();

    install({ thread: () => failure(500, 'internal') });
    renderScreen();
    expect(
      await screen.findByRole('heading', { name: 'We couldn’t open this conversation' }),
    ).toBeInTheDocument();
  });

  it('offline before the conversation loads', async () => {
    install({
      thread: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { container } = renderScreen();
    expect(await screen.findByRole('heading', { name: 'You are offline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
