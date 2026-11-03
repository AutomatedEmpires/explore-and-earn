'use client';

import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { tokenVar } from '@/ui/tokens';
import {
  axisTick,
  ChartFigure,
  ChartTable,
  defaultFormat,
  seriesColor,
  Swatch,
  tooltipStyles,
  type ChartColor,
  type ChartView,
} from './ChartParts';

export type StackedSeries = { key: string; label: string; color?: ChartColor };
export type StackedDatum = { label: string; values: Readonly<Record<string, number>> };

export type StackedBarProps = {
  title: string;
  description?: ReactNode;
  series: readonly StackedSeries[];
  data: readonly StackedDatum[];
  view?: ChartView;
  /** `columns` stacks upward per label; `rows` draws horizontal bars (good for one or two rows). */
  orientation?: 'columns' | 'rows';
  labelHeader?: string;
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
};

export function StackedBar({
  title,
  description,
  series,
  data,
  view = 'chart',
  orientation = 'columns',
  labelHeader = 'Name',
  formatValue = defaultFormat,
  height = 240,
  className,
}: StackedBarProps) {
  const total = (d: StackedDatum) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0);

  if (view === 'table') {
    return (
      <ChartTable
        className={className}
        title={title}
        description={description}
        columns={[
          { key: 'label', header: labelHeader },
          ...series.map((s) => ({ key: s.key, header: s.label, numeric: true })),
          { key: 'total', header: 'Total', numeric: true },
        ]}
        rows={data.map((d) => ({
          key: d.label,
          cells: [
            d.label,
            ...series.map((s) => formatValue(d.values[s.key] ?? 0)),
            formatValue(total(d)),
          ],
        }))}
      />
    );
  }

  const rows = data.map((d) => ({ label: d.label, ...d.values }));
  const horizontal = orientation === 'rows';
  const legend = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-13 text-ink-2">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <Swatch color={seriesColor(i, s.color)} />
          {s.label}
        </li>
      ))}
    </ul>
  );

  return (
    <ChartFigure className={className} title={title} description={description} legend={legend}>
      <BarChart
        responsive
        data={rows}
        title={title}
        layout={horizontal ? 'vertical' : 'horizontal'}
        style={{ width: '100%', height }}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={tokenVar('line')} />
        {horizontal ? (
          <>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={88}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis
              width={40}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              allowDecimals={false}
              tickFormatter={(v: number) => formatValue(v)}
            />
          </>
        )}
        <Tooltip
          cursor={{ fill: tokenVar('surface-2') }}
          formatter={(v) => formatValue(Number(v))}
          {...tooltipStyles}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="stack"
            fill={seriesColor(i, s.color)}
            stroke={tokenVar('surface')}
            strokeWidth={1}
            maxBarSize={horizontal ? 28 : 40}
          />
        ))}
      </BarChart>
    </ChartFigure>
  );
}
