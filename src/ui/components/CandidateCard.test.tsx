// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateCard, type CandidateCardProps } from './CandidateCard';

const applicant: CandidateCardProps = {
  variant: 'applicant',
  href: '/host/applicants/1',
  firstName: 'Maya',
  lastName: 'Rodriguez',
  location: 'Bend, OR',
  avatarSrc: '/avatars/maya.webp',
  showPhoto: true,
  interests: ['seasonal', 'maritime'],
  appliedDaysAgo: 2,
  appliedFor: 'Lodge Housekeeper',
  availableFrom: 'May 10, 2027',
  availableThrough: 'Sep 30',
  resume: { summary: '3 seasons' },
  fit: { score: 86, label: 'Strong' },
  skills: { count: 12 },
  onOpenChip: () => {},
};

describe('CandidateCard', () => {
  it('renders initials, not an <img>, when showPhoto is false', () => {
    const { container } = render(<CandidateCard {...applicant} showPhoto={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('MR')).toBeInTheDocument();
  });

  it('renders the photo when showPhoto is true', () => {
    render(<CandidateCard {...applicant} />);
    expect(screen.getByRole('img', { name: 'Maya Rodriguez' })).toHaveAttribute(
      'src',
      '/avatars/maya.webp',
    );
  });

  it('fills the shared card slots for an applicant', () => {
    render(<CandidateCard {...applicant} />);
    const card = screen.getByRole('article');
    expect(within(card).getByRole('link', { name: 'Maya Rodriguez' })).toHaveAttribute(
      'href',
      '/host/applicants/1',
    );
    expect(within(card).getByText('Seasonal, Maritime')).toBeInTheDocument();
    expect(within(card).getByText('Applied 2 days ago')).toBeInTheDocument();
    expect(within(card).getByText('· Applied for Lodge Housekeeper')).toBeInTheDocument();
    expect(within(card).getByText('Available May 10, 2027')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /^Resume/ })).toHaveTextContent('3 seasons');
    expect(within(card).getByRole('button', { name: /^Fit/ })).toHaveTextContent('86');
    expect(within(card).getByRole('button', { name: /^Skills/ })).toHaveTextContent('12 listed');
    for (const name of ['Pass', 'Interview', 'Shortlist']) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows first name and last initial with Hide, Invite and Save in a candidate pool', () => {
    const onInvite = vi.fn();
    render(
      <CandidateCard
        variant="pool"
        href="/host/candidates/1"
        firstName="Maya"
        lastName="Rodriguez"
        location="Bend, OR"
        showPhoto={false}
        interests={['farm']}
        availableFrom="May 10, 2027"
        resume={{ summary: '3 seasons' }}
        fit={{ score: 72 }}
        skills={{ count: 4 }}
        onInvite={onInvite}
      />,
    );
    expect(screen.getByRole('link', { name: 'Maya R.' })).toBeInTheDocument();
    expect(screen.queryByText(/Applied/)).toBeNull();
    for (const name of ['Hide', 'Invite', 'Save']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(onInvite).toHaveBeenCalledOnce();
  });
});
