// @vitest-environment jsdom
// WCAG 2.5.3 Label in Name (axe: label-content-name-mismatch). A control that shows text must
// not replace it with an aria-label that leaves the text out: speech users say what they see.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobCard } from './JobCard';
import { OrgSwitcher } from './OrgSwitcher';

const job = {
  href: '/jobs/1',
  position: 'Orchard Harvest Crew',
  location: 'Hood River, OR',
  category: 'farm',
  starts: { inDays: 30 },
  housing: { provided: true },
  meals: { provided: false },
  pay: { amountCents: 1850, per: 'hour' },
} as const;

describe('Label in Name', () => {
  it('names the host logo link from its content, not an aria-label over the initials', () => {
    render(<JobCard {...job} host={{ name: 'Hollow Oak Orchards', href: '/hosts/hollow-oak' }} />);
    const link = screen.getByRole('link', { name: 'Hollow Oak Orchards host page' });
    expect(link).not.toHaveAttribute('aria-label');
    expect(link).toHaveAttribute('href', '/hosts/hollow-oak');
  });

  it('names the organization switcher with its visible name and role', () => {
    render(
      <OrgSwitcher
        orgs={[{ id: 'kr', name: 'Kettle Ridge Lodge', roleLabel: 'Owner' }]}
        currentId="kr"
        onSelect={() => {}}
      />,
    );
    const trigger = screen.getByRole('button', { name: /^Switch organization/ });
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveAccessibleName(/Kettle Ridge Lodge\s*Owner/);
  });

  it('names the compact organization switcher, which shows only the logo', () => {
    render(
      <OrgSwitcher
        orgs={[{ id: 'kr', name: 'Kettle Ridge Lodge' }]}
        currentId="kr"
        onSelect={() => {}}
        compact
      />,
    );
    expect(
      screen.getByRole('button', { name: /^Switch organization, current: Kettle Ridge Lodge$/ }),
    ).toBeInTheDocument();
  });
});
