// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Search } from '@/ui/icons';
import { Placeholder } from './Placeholder';

describe('Placeholder', () => {
  it('names the screen and the sub-project that delivers it', () => {
    render(
      <Placeholder
        title="Seek"
        subProject={3}
        name="Discovery"
        icon={Search}
        description="Jobs worth going somewhere for."
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Seek' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Coming in sub-project 3: Discovery' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Jobs worth going somewhere for.')).toBeInTheDocument();
  });
});
