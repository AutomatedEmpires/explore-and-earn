// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOSTS_CANT_APPLY,
  LISTING_CHANGED_PROMPT,
  SPONSORSHIP_PROMPT,
  UNAVAILABLE,
  youBlocked,
} from '@/lib/applications';
import { draftKey, saveDraft, emptyDraft } from '../_lib/draft';
import { LISTING_ID, SAMPLE_ORG, sampleContext, sampleReceipt } from '../_lib/sample';
import { ApplyFlow } from './ApplyFlow';

const yesNo = {
  id: 'start',
  type: 'yes_no' as const,
  prompt: 'Can you start on May 15?',
  required: true,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, reason: string, message = 'No'): Response {
  return json({ error: { code: 'conflict', message, details: { reason } } }, status);
}

let fetchMock: ReturnType<typeof vi.fn>;

function install(routes: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return routes(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function postBodies(): unknown[] {
  return fetchMock.mock.calls
    .filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

function renderFlow(source = 'other', invite: string | null = null) {
  return render(
    <ApplyFlow listingId={LISTING_ID} source={source} invite={invite} fallback={{ title: 'Lodge housekeeper', orgName: SAMPLE_ORG }} />,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplyFlow', () => {
  it('does not submit until Send application is clicked', async () => {
    install((url) => (url.includes('/context') ? json(sampleContext()) : json({})));
    renderFlow('swipe');
    await screen.findByRole('button', { name: 'Send application' });
    expect(postBodies()).toEqual([]);
  });

  it('sends source swipe with no inviteId, then shows the sent frame', async () => {
    const invite = '00000000-0000-4000-8000-0000000000aa';
    install((url, init) => {
      if (url.includes('/context')) return json(sampleContext());
      if (init?.method === 'POST') return json({ application: sampleReceipt(), created: true }, 201);
      return json({});
    });
    renderFlow('swipe', invite);
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('heading', { name: 'Application sent' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View application' })).toHaveAttribute(
      'href',
      `/profile/applications/${sampleReceipt().applicationId}`,
    );
    expect(postBodies()).toEqual([
      expect.objectContaining({ source: 'swipe', acknowledgeSponsorship: false, answers: [] }),
    ]);
    expect(postBodies()[0]).not.toHaveProperty('inviteId');
    expect(sessionStorage.getItem(draftKey(LISTING_ID))).toBeNull();
    expect(screen.getByText('You never pay to get a job.')).toBeInTheDocument();
    expect(screen.getByText(`${SAMPLE_ORG} usually replies within a day.`)).toBeInTheDocument();
    expect(screen.getByText('Whitefish, MT')).toBeInTheDocument();
  });

  it('sends inviteId only for an invite uuid', async () => {
    const invite = '00000000-0000-4000-8000-0000000000aa';
    install((url, init) => {
      if (url.includes('/context')) return json(sampleContext());
      if (init?.method === 'POST') return json({ application: sampleReceipt(), created: true }, 201);
      return json({});
    });
    renderFlow('invite', invite);
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    await screen.findByRole('heading', { name: 'Application sent' });
    expect(postBodies()[0]).toMatchObject({ source: 'invite', inviteId: invite });
  });

  it('omits a nonsense invite id and still sends source invite', async () => {
    install((url, init) => {
      if (url.includes('/context')) return json(sampleContext());
      if (init?.method === 'POST') return json({ application: sampleReceipt(), created: true }, 201);
      return json({});
    });
    renderFlow('invite', 'nonsense');
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    await screen.findByRole('heading', { name: 'Application sent' });
    expect(postBodies()[0]).toMatchObject({ source: 'invite' });
    expect(postBodies()[0]).not.toHaveProperty('inviteId');
  });

  it('opens the visa dialog and resubmits with acknowledgement', async () => {
    let posts = 0;
    install((url, init) => {
      if (url.includes('/context')) return json(sampleContext());
      if (init?.method === 'POST') {
        posts += 1;
        if (posts === 1) return failure(409, 'sponsorship_ack_required', "This host doesn't sponsor visas.");
        return json({ application: sampleReceipt(), created: true }, 201);
      }
      return json({});
    });
    renderFlow();
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('dialog', { name: SPONSORSHIP_PROMPT })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply anyway' }));
    await screen.findByRole('heading', { name: 'Application sent' });
    expect(postBodies()[1]).toMatchObject({ acknowledgeSponsorship: true });
  });

  it('reloads on listing_changed and shows the new question on review', async () => {
    let loads = 0;
    install((url, init) => {
      if (url.includes('/context')) {
        loads += 1;
        return json(
          loads === 1
            ? sampleContext()
            : sampleContext({ questions: [{ ...yesNo, id: 'lift', prompt: 'Can you lift 25 lb?' }] }),
        );
      }
      if (init?.method === 'POST') return failure(409, 'listing_changed', 'Changed');
      return json({});
    });
    renderFlow();
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('dialog', { name: LISTING_CHANGED_PROMPT })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review the job' }));
    expect(await screen.findByText('Can you lift 25 lb?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review your application' })).toBeInTheDocument();
  });

  it('shows the block copy and no send button', async () => {
    install(() => json(sampleContext({ blocked: 'you_blocked' })));
    renderFlow();
    expect(await screen.findByRole('heading', { name: youBlocked(SAMPLE_ORG) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull();
  });

  it('shows the unavailable copy when the host blocked the seeker', async () => {
    install(() => json(sampleContext({ blocked: 'unavailable' })));
    renderFlow();
    expect(await screen.findByRole('heading', { name: UNAVAILABLE })).toBeInTheDocument();
  });

  it('links an existing application and does not show the form', async () => {
    const id = sampleReceipt().applicationId;
    install(() => json(sampleContext({ existingApplicationId: id })));
    renderFlow();
    expect(await screen.findByRole('heading', { name: "You've already applied to this job." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View application' })).toHaveAttribute(
      'href',
      `/profile/applications/${id}`,
    );
    expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull();
  });

  it('shows a closed job with no submit button', async () => {
    install(() =>
      json(sampleContext({ listing: { ...sampleContext().listing, status: 'closed' } })),
    );
    renderFlow();
    expect(await screen.findByRole('heading', { name: 'This job is closed.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull();
  });

  it('keeps a Yes answer across a remount', async () => {
    install((url) => (url.includes('/context') ? json(sampleContext({ questions: [yesNo] })) : json({})));
    const first = renderFlow();
    expect(
      await screen.findByText("You're signed in. Finish applying to Lodge housekeeper."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Saved on this phone.')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await waitFor(() => {
      expect(sessionStorage.getItem(draftKey(LISTING_ID))).toContain('true');
    });
    first.unmount();
    renderFlow();
    expect(await screen.findByRole('radio', { name: 'Yes' })).toBeChecked();
  });

  it('offers Classic when the resume is unavailable, then resubmits', async () => {
    let posts = 0;
    install((url, init) => {
      if (url.includes('/context')) return json(sampleContext());
      if (url.includes('/me/profile') && init?.method === 'PATCH') return json({});
      if (init?.method === 'POST') {
        posts += 1;
        if (posts === 1) return failure(409, 'resume_unavailable', 'Resume unavailable');
        return json({ application: sampleReceipt(), created: true }, 201);
      }
      return json({});
    });
    renderFlow();
    fireEvent.click(await screen.findByRole('button', { name: 'Send application' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use Classic instead' }));
    await screen.findByRole('heading', { name: 'Application sent' });
    const patch = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes('/me/profile') && (call[1] as RequestInit).method === 'PATCH',
    );
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ resume: { mode: 'classic' } });
  });

  it('tells a host account they cannot apply', async () => {
    install(() => failure(403, 'wrong_account_type', 'This needs a seeker account'));
    renderFlow();
    expect(await screen.findByRole('heading', { name: HOSTS_CANT_APPLY })).toBeInTheDocument();
  });

  it('shows offline without calling the API', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    install(() => json(sampleContext()));
    renderFlow();
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByText('Saved on this phone.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the error frame when the context request fails', async () => {
    install(() => json({ error: { code: 'internal', message: 'Internal error' } }, 500));
    renderFlow();
    expect(await screen.findByRole('heading', { name: "We couldn't send your application" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('patches missing profile fields before leaving details', async () => {
    let saved = false;
    install((url) => {
      if (url.includes('/me/profile')) {
        saved = true;
        return json({});
      }
      if (url.includes('/context')) {
        return json(
          saved
            ? sampleContext()
            : sampleContext({
                missingFields: ['first_name', 'work_authorization'],
                preview: { ...sampleContext().preview, firstName: '', workAuthorization: null },
              }),
        );
      }
      return json({});
    });
    saveDraft(LISTING_ID, {
      ...emptyDraft(),
      firstName: 'Maya',
      workAuthorization: 'authorized',
    });
    renderFlow();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Review your application' })).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
      identity: { firstName: 'Maya' },
      workAuthorization: { status: 'authorized' },
    });
  });
});
