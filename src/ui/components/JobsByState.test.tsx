// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobsByState } from './JobsByState';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('JobsByState', () => {
  it('names an open state and shows its count on hover', () => {
    render(<JobsByState openJobs={{ WY: 31 }} />);

    const wyoming = screen.getByRole('link', { name: 'Wyoming, 31 open jobs' });
    fireEvent.pointerEnter(wyoming);
    expect(screen.getByText('Wyoming')).toBeInTheDocument();
    expect(screen.getByText('31 open jobs')).toBeInTheDocument();
    expect(screen.getByText('Open jobs now (1 state)')).toBeInTheDocument();
  });

  it('marks a state with no jobs as coming soon', () => {
    render(<JobsByState openJobs={{}} />);
    expect(screen.getByRole('button', { name: 'Ohio, Coming soon' })).toBeInTheDocument();
    expect(screen.getByText('Open jobs now (0 states)')).toBeInTheDocument();
  });
});
