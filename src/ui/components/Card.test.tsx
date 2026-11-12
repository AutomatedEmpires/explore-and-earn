// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardTitleLink, type CardProps } from './Card';
import { Chip } from './Chip';

const three: CardProps['chips'] = [
  <Chip key="a" label="Housing" value="Provided" onOpen={() => {}} />,
  <Chip key="b" label="Meals" value="Provided" onOpen={() => {}} />,
  <Chip key="c" label="Pay" value="$19/hr" onOpen={() => {}} />,
];

describe('Card', () => {
  it('takes exactly three chips', () => {
    // @ts-expect-error the shared card template has exactly three chips
    const two: CardProps['chips'] = [
      <Chip key="a" label="Housing" value="Provided" />,
      <Chip key="b" label="Meals" value="Provided" />,
    ];
    expect(two).toHaveLength(2);
  });

  it('renders every slot', () => {
    render(
      <Card
        cover={<div data-testid="cover" />}
        coverBadge={<span>Seasonal</span>}
        coverAction={<button type="button">More info</button>}
        identity={<span>KR</span>}
        title={<CardTitleLink href="/jobs/1">Lodge Housekeeper</CardTitleLink>}
        subtitle="Kettle Ridge Lodge"
        info="Starts in 12 days"
        chips={three}
        actions={<button type="button">Apply</button>}
      />,
    );
    const card = screen.getByRole('article');
    expect(within(card).getByTestId('cover')).toBeInTheDocument();
    expect(within(card).getByText('Seasonal')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'Lodge Housekeeper' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Lodge Housekeeper' })).toHaveAttribute(
      'href',
      '/jobs/1',
    );
    expect(within(card).getByText('Kettle Ridge Lodge')).toBeInTheDocument();
    expect(within(card).getByText('Starts in 12 days')).toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: /Housing|Meals|Pay/ })).toHaveLength(3);
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('renders the note under the info row and the extra block between chips and actions', () => {
    render(
      <Card
        title={<CardTitleLink href="/jobs/1">Lodge Housekeeper</CardTitleLink>}
        info="Starts in 12 days"
        note="Confirmed active 2 days ago"
        chips={three}
        belowChips={<button type="button">How we work this out</button>}
        actions={<button type="button">Apply</button>}
      />,
    );
    const info = screen.getByText('Starts in 12 days');
    const note = screen.getByText('Confirmed active 2 days ago');
    expect(info.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const how = screen.getByRole('button', { name: 'How we work this out' });
    expect(how.closest('.z-10')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Pay/ }).compareDocumentPosition(how)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(how.compareDocumentPosition(screen.getByRole('button', { name: 'Apply' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('drops the cover area, its badges and the identity when hideCover is set', () => {
    const { container } = render(
      <Card
        hideCover
        cover={<div data-testid="cover" />}
        coverBadge={<span>Seasonal</span>}
        identity={<span>KR</span>}
        title={<CardTitleLink href="/jobs/1">Lodge Housekeeper</CardTitleLink>}
        chips={three}
      />,
    );
    expect(screen.queryByTestId('cover')).toBeNull();
    expect(screen.queryByText('Seasonal')).toBeNull();
    expect(screen.queryByText('KR')).toBeNull();
    expect(container.querySelector('[data-slot="body"]')).toHaveClass('pt-4');
  });

  it('keeps chips and actions above the stretched title link', () => {
    render(
      <Card
        title={<CardTitleLink href="/jobs/1">Lodge Housekeeper</CardTitleLink>}
        chips={three}
        actions={<button type="button">Apply</button>}
      />,
    );
    expect(screen.getByRole('link').className).toContain('after:inset-0');
    expect(screen.getByRole('button', { name: 'Apply' }).parentElement?.className).toContain(
      'z-10',
    );
  });
});
