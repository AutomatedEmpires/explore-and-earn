// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  formatPay,
  formatStart,
  JobCard,
  payLabel,
  type JobCardProps,
  type PayPeriod,
} from './JobCard';

const base: JobCardProps = {
  href: '/jobs/lodge-housekeeper',
  position: 'Lodge Housekeeper',
  host: { name: 'Kettle Ridge Lodge', href: '/hosts/kettle-ridge-lodge', subscriber: true },
  location: 'Seward, AK',
  category: 'seasonal',
  starts: { inDays: 12 },
  endsOn: 'Sep 20',
  housing: { provided: true },
  meals: { provided: true },
  pay: { amountCents: 1900, per: 'hour' },
  onOpenChip: () => {},
};

function chip(name: RegExp) {
  return screen.getByRole('button', { name });
}

describe('JobCard', () => {
  it('shows "Housing" and "Provided" with the check icon when housing is provided', () => {
    render(<JobCard {...base} housing={{ provided: true }} />);
    const housing = chip(/^Housing/);
    expect(within(housing).getByText('Housing')).toBeInTheDocument();
    expect(within(housing).getByText('Provided')).toBeInTheDocument();
    expect(housing.querySelector('svg.lucide-check')).not.toBeNull();
  });

  it('shows "No housing" without the check icon when housing is not provided', () => {
    render(<JobCard {...base} housing={{ provided: false }} />);
    const housing = chip(/^Housing/);
    expect(within(housing).getByText('No housing')).toBeInTheDocument();
    expect(within(housing).queryByText('Provided')).toBeNull();
    expect(housing.querySelector('svg.lucide-check')).toBeNull();
  });

  it('fills the shared card slots from the job fields', () => {
    render(<JobCard {...base} meals={{ provided: false }} boosted />);
    const card = screen.getByRole('article');
    expect(within(card).getByRole('link', { name: 'Lodge Housekeeper' })).toHaveAttribute(
      'href',
      '/jobs/lodge-housekeeper',
    );
    expect(within(card).getByText('Seasonal')).toBeInTheDocument();
    expect(within(card).getByText('Boosted')).toBeInTheDocument();
    expect(within(card).getByText('Starts in 12 days')).toBeInTheDocument();
    expect(within(card).getByText('· Ends Sep 20')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Active subscriber' })).toBeInTheDocument();
    expect(within(chip(/^Meals/)).getByText('No meals')).toBeInTheDocument();
    expect(within(chip(/^Pay/)).getByText('$19/hr')).toBeInTheDocument();
  });

  it('renders static chips when nothing opens them', () => {
    render(<JobCard {...base} onOpenChip={undefined} />);
    expect(screen.queryByRole('button', { name: /^Housing/ })).toBeNull();
    expect(screen.getByText('Housing')).toBeInTheDocument();
  });

  it('formats a start date, cents and pay ranges', () => {
    render(
      <JobCard
        {...base}
        starts={{ on: 'May 10' }}
        endsOn={undefined}
        pay={{ amountCents: 1850, maxAmountCents: 2200, per: 'hour' }}
      />,
    );
    expect(screen.getByText('Begins May 10')).toBeInTheDocument();
    expect(screen.getByText('$18.50–22/hr')).toBeInTheDocument();
  });

  it('shows yearly pay in the Pay chip', () => {
    render(<JobCard {...base} pay={{ amountCents: 4500000, per: 'year' }} />);
    expect(within(chip(/^Pay/)).getByText('$45,000/yr')).toBeInTheDocument();
  });

  it('shows preformatted pay and start labels as given', () => {
    render(<JobCard {...base} pay={{ label: '$52k/yr' }} starts={{ label: 'Summer 2027' }} />);
    expect(within(chip(/^Pay/)).getByText('$52k/yr')).toBeInTheDocument();
    expect(screen.getByText('Summer 2027')).toBeInTheDocument();
  });

  it('shows the end label in place of "Ends ..."', () => {
    render(<JobCard {...base} endLabel="Ongoing" />);
    expect(screen.getByText('· Ongoing')).toBeInTheDocument();
    expect(screen.queryByText(/Ends/)).toBeNull();
  });

  it('shows a disabled "Applied" button once the seeker has applied', () => {
    const onApply = vi.fn();
    render(<JobCard {...base} applied onApply={onApply} />);
    const applied = screen.getByRole('button', { name: 'Applied' });
    expect(applied).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    fireEvent.click(applied);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('opens chips and runs the Skip, Apply and Save actions', () => {
    const onOpenChip = vi.fn();
    const onSkip = vi.fn();
    const onApply = vi.fn();
    const onSave = vi.fn();
    render(
      <JobCard
        {...base}
        onOpenChip={onOpenChip}
        onSkip={onSkip}
        onApply={onApply}
        onSave={onSave}
        saved
      />,
    );
    fireEvent.click(chip(/^Housing/));
    fireEvent.click(chip(/^Pay/));
    expect(onOpenChip.mock.calls).toEqual([['housing'], ['pay']]);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(save);
    expect([onSkip, onApply, onSave].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('formatPay', () => {
  it.each<[PayPeriod, string]>([
    ['hour', '$19/hr'],
    ['day', '$19/day'],
    ['week', '$19/wk'],
    ['month', '$19/mo'],
    ['season', '$19/season'],
    ['year', '$19/yr'],
  ])('labels %s pay "%s"', (per, label) => {
    expect(formatPay({ amountCents: 1900, per })).toBe(label);
  });

  it('writes yearly amounts and ranges with thousands separators', () => {
    expect(formatPay({ amountCents: 4500000, per: 'year' })).toBe('$45,000/yr');
    expect(formatPay({ amountCents: 4500000, maxAmountCents: 5200000, per: 'year' })).toBe(
      '$45,000–52,000/yr',
    );
  });

  it('ignores a maximum that is not above the minimum', () => {
    expect(formatPay({ amountCents: 4500000, maxAmountCents: 4500000, per: 'year' })).toBe(
      '$45,000/yr',
    );
  });
});

describe('payLabel and formatStart', () => {
  it('pass a preformatted label through and format the rest', () => {
    expect(payLabel({ label: '$19–$22/hr' })).toBe('$19–$22/hr');
    expect(payLabel({ amountCents: 4500000, per: 'year' })).toBe('$45,000/yr');
    expect(formatStart({ label: 'Summer 2027' })).toBe('Summer 2027');
    expect(formatStart({ on: 'May 10' })).toBe('Begins May 10');
    expect(formatStart({ inDays: 1 })).toBe('Starts in 1 day');
    expect(formatStart({ inDays: 0 })).toBe('Starts today');
  });
});
