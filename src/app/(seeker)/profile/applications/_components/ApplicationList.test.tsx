// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyApplicationRow } from '@/lib/applications';
import { ApplicationList } from './ApplicationList';

const applied: MyApplicationRow = {
  applicationId: '00000000-0000-4000-8000-0000000000b2',
  listingId: '00000000-0000-4000-8000-0000000000b1',
  title: 'Lodge housekeeper',
  orgName: 'Kettle Ridge Lodge',
  orgLogoMediaId: null,
  seekerStatus: 'applied',
  submittedAt: '2026-11-08T18:00:00.000Z',
};

const interviewing: MyApplicationRow = {
  ...applied,
  applicationId: '00000000-0000-4000-8000-0000000000b9',
  title: 'Ranch hand',
  orgName: 'Red Creek Ranch',
  seekerStatus: 'interviewing',
  submittedAt: '2026-11-09T18:00:00.000Z',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplicationList', () => {
  it('shows the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [] })));
    render(<ApplicationList />);
    expect(await screen.findByRole('heading', { name: "You haven't applied yet." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a job' })).toHaveAttribute('href', '/');
    expect(screen.getByText('You never pay to get a job.')).toBeInTheDocument();
  });

  it('shows Sent and Interviewing rows from the three views', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('view=interviews')) return json({ items: [interviewing] });
        if (url.includes('view=offers')) return json({ items: [] });
        return json({ items: [applied] });
      }),
    );
    render(<ApplicationList />);
    expect(await screen.findByRole('link', { name: /Lodge housekeeper/ })).toHaveAttribute(
      'href',
      `/profile/applications/${applied.applicationId}`,
    );
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Interviewing').length).toBeGreaterThan(0);
    expect(screen.getByText('Kettle Ridge Lodge usually replies within a day.')).toBeInTheDocument();
  });
});
