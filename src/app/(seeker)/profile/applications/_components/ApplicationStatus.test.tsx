// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADDITIONAL_STEP_DONE } from '@/lib/applications';
import { sampleReceipt } from '../../../apply/[listingId]/_lib/sample';
import { ApplicationStatus } from './ApplicationStatus';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplicationStatus', () => {
  it('shows Sent, the reply time and the trust line', () => {
    render(<ApplicationStatus receipt={sampleReceipt()} />);
    expect(screen.getByRole('heading', { name: 'Lodge housekeeper' })).toBeInTheDocument();
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    expect(screen.getByText('Kettle Ridge Lodge usually replies within a day.')).toBeInTheDocument();
    expect(screen.getByText('You never pay to get a job.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });

  it('hides Withdraw when the application can no longer be withdrawn', () => {
    render(<ApplicationStatus receipt={sampleReceipt({ canWithdraw: false, seekerStatus: 'hired' })} />);
    expect(screen.getAllByText('Hired').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('ticks the employer form', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json(sampleReceipt({ additionalStepCompletedAt: '2026-11-09T00:00:00.000Z' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ApplicationStatus
        receipt={sampleReceipt({
          canTickAdditionalStep: true,
          snapshot: {
            ...sampleReceipt().snapshot,
            listing: {
              ...sampleReceipt().snapshot.listing,
              additionalStep: { note: 'Fill in the park form.', url: 'https://example.com/form' },
            },
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: ADDITIONAL_STEP_DONE }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/additional-step'),
      expect.objectContaining({ method: 'PUT' }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ completed: true });
  });

  it('withdraws with the chosen reason and then shows Withdrawn', async () => {
    const withdrawn = sampleReceipt({
      seekerStatus: 'withdrawn',
      canWithdraw: false,
      events: [
        { type: 'submitted', seekerStatus: 'applied', at: '2026-11-08T18:00:00.000Z' },
        { type: 'withdrawn', seekerStatus: 'withdrawn', at: '2026-11-09T18:00:00.000Z' },
      ],
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(withdrawn));
    vi.stubGlobal('fetch', fetchMock);
    render(<ApplicationStatus receipt={sampleReceipt()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw application' }));
    expect((await screen.findAllByText('Withdrawn')).length).toBeGreaterThan(0);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ reason: 'not_interested' });
  });
});
