// @vitest-environment jsdom
// ReportForm and ReportSheet (SP4 plan Task 33): the 9 reasons, Submit only after a reason, the
// POST /reports body, the thanks line, the daily limit and the 1000-character details.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { REPORT_REASON_LABELS, REPORT_THANKS } from '@/lib/safety';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';
import { seriousOrCritical } from './axe-test-helper';
import { REPORT_PRIVACY, REPORT_RATE_LIMITED } from './copy';
import { ReportForm } from './ReportForm';
import { ReportSheet } from './ReportSheet';

setupMswServer();

const LISTING_ID = '019a4a3c-0000-7000-8000-0000000d0001';
const REPORT_ID = '019a4a3c-0000-7000-8000-00000000a001';
const subject = { type: 'listing' as const, id: LISTING_ID };

function answerReports(status = 201) {
  const bodies: unknown[] = [];
  server.use(
    http.post(apiUrl('/api/v1/reports'), async ({ request }) => {
      bodies.push(await request.json());
      if (status === 201) return HttpResponse.json({ reportId: REPORT_ID }, { status });
      return HttpResponse.json(
        { error: { code: status === 429 ? 'rate_limited' : 'internal', message: 'No' } },
        { status },
      );
    }),
  );
  return bodies;
}

describe('ReportForm', () => {
  it('lists the 9 reasons with the shared labels, in order', () => {
    render(<ReportForm subject={subject} />);
    const group = screen.getByRole('group', { name: "What's wrong?" });
    const labels = within(group)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label')?.textContent);
    expect(labels).toEqual(Object.values(REPORT_REASON_LABELS));
  });

  it('says plainly that the reported party never learns who reported or why', () => {
    render(<ReportForm subject={subject} />);
    expect(screen.getByText(REPORT_PRIVACY)).toBeInTheDocument();
  });

  it('keeps Send report disabled until a reason is chosen', () => {
    render(<ReportForm subject={subject} />);
    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Scam or fraud' }));
    expect(send).toBeEnabled();
  });

  it('sends the subject, the reason and the details, then shows only the thanks line', async () => {
    const bodies = answerReports();
    const done: string[] = [];
    render(<ReportForm subject={subject} onSubmitted={(id) => done.push(id)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Scam or fraud' }));
    fireEvent.change(screen.getByLabelText('Details (optional)'), {
      target: { value: 'They asked for a deposit by wire.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    const thanks = await screen.findByText(REPORT_THANKS);
    expect(bodies).toEqual([
      {
        subjectType: 'listing',
        subjectId: LISTING_ID,
        reason: 'scam',
        details: 'They asked for a deposit by wire.',
      },
    ]);
    expect(done).toEqual([REPORT_ID]);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument();
    // Focus moves to the thanks line, so it isn't lost with the removed button.
    await waitFor(() => expect(thanks.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('leaves out empty details', async () => {
    const bodies = answerReports();
    render(<ReportForm subject={subject} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText(REPORT_THANKS);
    expect(bodies).toEqual([{ subjectType: 'listing', subjectId: LISTING_ID, reason: 'spam' }]);
  });

  it('shows the daily limit on a 429 and keeps what was typed', async () => {
    answerReports(429);
    render(<ReportForm subject={subject} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Harassment' }));
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: 'Rude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(REPORT_RATE_LIMITED);
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('Rude');
    expect(screen.getByRole('radio', { name: 'Harassment' })).toBeChecked();
  });

  it('stops the details at 1000 characters and counts them', () => {
    render(<ReportForm subject={subject} />);
    const details = screen.getByLabelText('Details (optional)');
    expect(details).toHaveAttribute('maxlength', '1000');
    fireEvent.change(details, { target: { value: 'a'.repeat(1001) } });
    expect(details).toHaveValue('a'.repeat(1000));
    expect(screen.getByText('1000 of 1000')).toBeInTheDocument();
  });

  it('asks a signed-out reporter to sign in and come back', async () => {
    server.use(
      http.post(apiUrl('/api/v1/reports'), () =>
        HttpResponse.json({ error: { code: 'unauthorized', message: 'No' } }, { status: 401 }),
      ),
    );
    render(<ReportForm subject={subject} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute(
      'href',
      `/sign-in?redirect_url=${encodeURIComponent(`/report?subject=listing:${LISTING_ID}`)}`,
    );
  });
});

describe('ReportForm accessibility', () => {
  it('has no serious or critical axe violations while editing, after a failure and when sent', async () => {
    let status = 429;
    server.use(
      http.post(apiUrl('/api/v1/reports'), () =>
        status === 201
          ? HttpResponse.json({ reportId: REPORT_ID }, { status: 201 })
          : HttpResponse.json({ error: { code: 'rate_limited', message: 'No' } }, { status }),
      ),
    );
    const { container } = render(<ReportForm subject={subject} />);
    expect(await seriousOrCritical(container)).toEqual([]);

    fireEvent.click(screen.getByRole('radio', { name: 'Scam or fraud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('alert');
    expect(await seriousOrCritical(container)).toEqual([]);

    status = 201;
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText(REPORT_THANKS);
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('gives every reason a 44 px row and the details a visible label', () => {
    render(<ReportForm subject={subject} />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')).toHaveClass('min-h-11');
    }
    expect(screen.getByLabelText('Details (optional)')).toBeVisible();
  });
});

describe('ReportSheet', () => {
  it('opens from its trigger, sends from the pinned button and returns focus on close', async () => {
    answerReports();
    render(<ReportSheet subject={subject} trigger={<button type="button">Report</button>} />);
    const trigger = screen.getByRole('button', { name: 'Report' });
    trigger.focus();
    fireEvent.click(trigger);

    const sheet = await screen.findByRole('dialog', { name: 'Report this job' });
    expect(await seriousOrCritical(document.body)).toEqual([]);
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Not as described' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send report' }));
    expect(await within(sheet).findByText(REPORT_THANKS)).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    // A second report on another visit starts from a fresh form.
    fireEvent.click(trigger);
    const again = await screen.findByRole('dialog', { name: 'Report this job' });
    expect(within(again).getByRole('button', { name: 'Send report' })).toBeDisabled();
  });
});
