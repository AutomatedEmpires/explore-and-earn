// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';
import { DonutChart } from './DonutChart';
import { StackedBar } from './StackedBar';

const slices = [
  { label: 'Maritime', value: 12, color: 'maritime' as const },
  { label: 'Seasonal', value: 30, color: 'seasonal' as const },
  { label: 'Farm', value: 8, color: 'farm' as const },
];

describe('DonutChart', () => {
  it('renders a <table> with one row per slice in table mode', () => {
    render(<DonutChart title="Applicants by category" data={slices} view="table" />);
    const table = screen.getByRole('table', { name: 'Applicants by category' });
    const body = within(table).getAllByRole('rowgroup')[1];
    expect(body).toBeDefined();
    const rows = within(body as HTMLElement).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByRole('rowheader')).toHaveTextContent('Seasonal');
    expect(rows[1]).toHaveTextContent('30');
    expect(rows[1]).toHaveTextContent('60%');
  });

  it('renders a labelled figure with a text legend in chart mode', () => {
    render(<DonutChart title="Applicants by category" data={slices} />);
    expect(screen.getByRole('figure', { name: 'Applicants by category' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Maritime')).toBeInTheDocument();
  });
});

describe('BarChart', () => {
  it('renders a table in table mode', () => {
    render(
      <BarChart
        title="Views per day"
        valueLabel="Views"
        view="table"
        data={[
          { label: 'Mon', value: 40 },
          { label: 'Tue', value: 52 },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Views per day' });
    expect(within(table).getByRole('columnheader', { name: 'Views' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});

describe('StackedBar', () => {
  it('renders one column per series and a total in table mode', () => {
    render(
      <StackedBar
        title="Applications by status"
        view="table"
        series={[
          { key: 'new', label: 'New', color: 'ink' },
          { key: 'hired', label: 'Hired', color: 'success' },
        ]}
        data={[{ label: 'Week 1', values: { new: 8, hired: 1 } }]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Applications by status' });
    for (const name of ['New', 'Hired', 'Total']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(within(table).getByRole('row', { name: /Week 1/ })).toHaveTextContent('9');
  });
});
