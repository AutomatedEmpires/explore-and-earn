import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { tokenVar } from '@/ui/tokens';

/** Charts take token colors only; there is no way to pass a raw color. */
export type ChartColor =
  'ink' | 'muted' | 'success' | 'warning' | 'danger' | 'maritime' | 'seasonal' | 'farm' | 'remote';

export type ChartView = 'chart' | 'table';

export const chartColor: Record<ChartColor, string> = {
  ink: tokenVar('ink'),
  muted: tokenVar('muted'),
  success: tokenVar('success'),
  warning: tokenVar('warning'),
  danger: tokenVar('danger'),
  maritime: tokenVar('maritime-solid'),
  seasonal: tokenVar('seasonal-solid'),
  farm: tokenVar('farm-solid'),
  remote: tokenVar('remote-solid'),
};

/** Used in order when a series or slice has no color of its own. */
export const defaultSeriesColors: readonly ChartColor[] = [
  'ink',
  'maritime',
  'seasonal',
  'farm',
  'remote',
  'muted',
];

export function seriesColor(index: number, color?: ChartColor): string {
  return chartColor[color ?? defaultSeriesColors[index % defaultSeriesColors.length] ?? 'ink'];
}

export const axisTick = { fill: tokenVar('muted'), fontSize: 13 } as const;

export const tooltipStyles: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: tokenVar('surface'),
    border: `1px solid ${tokenVar('line')}`,
    borderRadius: 12,
    boxShadow: 'var(--ee-shadow-raised)',
    fontSize: 14,
    padding: '8px 12px',
  },
  labelStyle: { color: tokenVar('ink'), fontWeight: 700, marginBottom: 4 },
  itemStyle: { color: tokenVar('ink-2'), padding: 0 },
};

export const defaultFormat = (value: number): string => value.toLocaleString('en-US');

export function ChartFigure({
  title,
  description,
  legend,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <figure aria-labelledby={titleId} className={cn('flex flex-col gap-3', className)}>
      <figcaption>
        <span id={titleId} className="block text-15 font-bold text-ink">
          {title}
        </span>
        {description ? <span className="block text-13 text-muted">{description}</span> : null}
      </figcaption>
      {legend}
      {children}
    </figure>
  );
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

export type TableColumn = { key: string; header: string; numeric?: boolean };

/** The accessible table that every chart renders in table mode. */
export function ChartTable({
  title,
  description,
  columns,
  rows,
  className,
}: {
  title: string;
  description?: ReactNode;
  columns: readonly TableColumn[];
  /** The first column of each row is its row header. */
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-14">
        <caption className="mb-2 text-left">
          <span className="block text-15 font-bold text-ink">{title}</span>
          {description ? <span className="block text-13 text-muted">{description}</span> : null}
        </caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'py-2 pr-3 text-13 font-semibold text-muted',
                  c.numeric ? 'text-right' : 'text-left',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-b-0">
              {row.cells.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="py-2 pr-3 text-left font-semibold text-ink">
                    {cell}
                  </th>
                ) : (
                  <td
                    key={i}
                    className={cn(
                      'py-2 pr-3 text-ink-2 tabular-nums',
                      columns[i]?.numeric ? 'text-right' : 'text-left',
                    )}
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
