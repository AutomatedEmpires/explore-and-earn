// @vitest-environment jsdom
// CandidateProfileView (SP4 plan Task 35, spec 8.3): the pool card shows only PoolCard fields;
// the interested stage shows the live profile and never any work authorization.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PoolCard } from '@/lib/profiles';
import { mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { seriousOrCritical } from '../safety/axe-test-helper';
import { CandidateProfileView } from './CandidateProfileView';

const pool: PoolCard = {
  seekerUserId: '019a4a3c-0000-7000-8000-00000000c001',
  firstName: 'Maya',
  lastInitial: 'R',
  city: 'Juneau',
  region: 'AK',
  countryCode: 'US',
  availabilityDate: '2027-05-01',
  skills: [
    { label: 'Line handling', highlighted: true },
    { label: 'Knots', highlighted: false },
  ],
  avatarMediaId: null,
  coverMediaId: null,
  categories: ['seasonal', 'maritime'],
};

describe('CandidateProfileView', () => {
  it('shows a pool card by first name and last initial, with no contact or last name', () => {
    render(<CandidateProfileView card={{ stage: 'pool', card: pool }} />);
    expect(screen.getByRole('heading', { name: 'Maya R.' })).toBeInTheDocument();
    expect(screen.getByText('Juneau, AK')).toBeInTheDocument();
    expect(screen.getByText('Available from May 1, 2027')).toBeInTheDocument();
    expect(screen.getByText('Line handling, Knots')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Rodriguez');
    expect(text).not.toContain('@');
    expect(screen.queryByRole('link', { name: 'Open resume' })).not.toBeInTheDocument();
  });

  it('shows the live profile once interested, without any work authorization', () => {
    const profile = mayaSnapshot({
      // Defensive: even a stray value is never shown outside an application.
      workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] },
    });
    render(
      <CandidateProfileView
        card={{ stage: 'interested', card: pool, profile }}
        resumeHref="/api/v1/host/candidates/c1/resume.pdf"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Maya Rodriguez' })).toBeInTheDocument();
    expect(screen.getByText('maya@example.test · (541) 555-0123')).toBeInTheDocument();
    expect(screen.getByText('Deckhand, Kettle Ridge Lodge')).toBeInTheDocument();
    expect(screen.getByText('Self-reported')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/visa|sponsor|H-2B/i);
    expect(screen.getByRole('link', { name: 'Open resume' })).toHaveAttribute(
      'href',
      '/api/v1/host/candidates/c1/resume.pdf',
    );
  });
});

describe('CandidateProfileView accessibility', () => {
  it('has no serious or critical axe violations in either stage', async () => {
    const pooled = render(<CandidateProfileView card={{ stage: 'pool', card: pool }} />);
    expect(await seriousOrCritical(pooled.container)).toEqual([]);
    pooled.unmount();
    const revealed = render(
      <CandidateProfileView
        card={{ stage: 'interested', card: pool, profile: mayaSnapshot() }}
        resumeHref="/resume.pdf"
      />,
    );
    expect(await seriousOrCritical(revealed.container)).toEqual([]);
  });
});
