'use client';

import type { ReactNode } from 'react';
import { Bar, CartesianGrid, BarChart as RechartsBarChart, Tooltip, XAxis, YAxis } from 'recharts';
import { tokenVar } from '@/ui/tokens';
import {
  axisTick,
  ChartFigure,
  ChartTable,
  chartColor,
  defaultFormat,
  tooltipStyles,
  type ChartColor,
  type ChartView,
} from './ChartParts';

export type BarDatum = { label: string; value: number };

export type BarChartProps = {
  title: string;
  description?: ReactNode;
  data: readonly BarDatum[];
  view?: ChartView;
  color?: ChartColor;
  /** Column headers in table mode. */
  labelHeader?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
};

export function BarChart({
  title,
  description,
  data,
  view = 'chart',
  color = 'ink',
  labelHeader = 'Name',
  valueLabel = 'Value',
  formatValue = defaultFormat,
  height = 240,
  className,
}: BarChartProps) {
  if (view === 'table') {
    return (
      <ChartTable
        className={className}
        title={title}
        description={description}
        columns={[
          { key: 'label', header: labelHeader },
          { key: 'value', header: valueLabel, numeric: true },
        ]}
        rows={data.map((d) => ({ key: d.label, cells: [d.label, formatValue(d.value)] }))}
      />
    );
  }
  return (
    <ChartFigure className={className} title={title} description={description}>
      <RechartsBarChart
        responsive
        data={[...data]}
        title={title}
        style={{ width: '100%', height }}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke={tokenVar('line')} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          allowDecimals={false}
          tickFormatter={(v: number) => formatValue(v)}
        />
        <Tooltip
          cursor={{ fill: tokenVar('surface-2') }}
          formatter={(v) => formatValue(Number(v))}
          {...tooltipStyles}
        />
        <Bar
          dataKey="value"
          name={valueLabel}
          fill={chartColor[color]}
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
        />
      </RechartsBarChart>
    </ChartFigure>
  );
}
