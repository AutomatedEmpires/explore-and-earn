'use client';

import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { tokenVar } from '@/ui/tokens';
import {
  ChartFigure,
  ChartTable,
  defaultFormat,
  seriesColor,
  Swatch,
  tooltipStyles,
  type ChartColor,
  type ChartView,
} from './ChartParts';

export type DonutSlice = { label: string; value: number; color?: ChartColor };

export type DonutChartProps = {
  title: string;
  description?: ReactNode;
  data: readonly DonutSlice[];
  view?: ChartView;
  /** Under the total in the middle, e.g. "applicants". */
  centerLabel?: string;
  labelHeader?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  size?: number;
  className?: string;
};

function percent(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
}

export function DonutChart({
  title,
  description,
  data,
  view = 'chart',
  centerLabel,
  labelHeader = 'Name',
  valueLabel = 'Value',
  formatValue = defaultFormat,
  size = 180,
  className,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (view === 'table') {
    return (
      <ChartTable
        className={className}
        title={title}
        description={description}
        columns={[
          { key: 'label', header: labelHeader },
          { key: 'value', header: valueLabel, numeric: true },
          { key: 'share', header: 'Share', numeric: true },
        ]}
        rows={data.map((d) => ({
          key: d.label,
          cells: [d.label, formatValue(d.value), percent(d.value, total)],
        }))}
      />
    );
  }

  return (
    <ChartFigure className={className} title={title} description={description}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <PieChart responsive title={title} style={{ width: size, height: size }}>
            <Pie
              data={data.map((d) => ({ ...d }))}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke={tokenVar('surface')}
              strokeWidth={2}
            >
              {data.map((d, i) => (
                <Cell key={d.label} fill={seriesColor(i, d.color)} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatValue(Number(v))} {...tooltipStyles} />
          </PieChart>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="text-24 font-extrabold text-ink tabular-nums">
              {formatValue(total)}
            </span>
            {centerLabel ? <span className="text-13 text-muted">{centerLabel}</span> : null}
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2 text-14">
          {data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-2">
              <Swatch color={seriesColor(i, d.color)} />
              <span className="flex-1 text-ink-2">{d.label}</span>
              <span className="font-bold text-ink tabular-nums">{formatValue(d.value)}</span>
              <span className="w-10 text-right text-muted tabular-nums">
                {percent(d.value, total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFigure>
  );
}
