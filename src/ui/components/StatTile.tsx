import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Minus, TrendingDown, TrendingUp, type IconComponent } from '@/ui/icons';

export type StatTrend = {
  /** Display text, e.g. "+12% vs last week". */
  label: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether this change is good news; colors it success, otherwise muted. */
  positive?: boolean;
};

export type StatTileProps = {
  label: string;
  value: ReactNode;
  trend?: StatTrend;
  hint?: ReactNode;
  icon?: IconComponent;
  className?: string;
};

const trendIcon: Record<StatTrend['direction'], IconComponent> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

/** One number with its label (host Home, analytics, the operator console). */
export function StatTile({ label, value, trend, hint, icon: Icon, className }: StatTileProps) {
  const TrendIcon = trend ? trendIcon[trend.direction] : null;
  return (
    <div className={cn('flex flex-col gap-1 rounded-xl bg-surface p-4 shadow-card', className)}>
      <p className="flex items-center gap-1.5 text-13 font-semibold text-muted">
        {Icon ? <Icon className="size-4" /> : null}
        {label}
      </p>
      <p className="text-28 font-extrabold text-ink tabular-nums">{value}</p>
      {trend && TrendIcon ? (
        <p
          className={cn(
            'flex items-center gap-1 text-13 font-semibold',
            trend.positive ? 'text-success' : 'text-muted',
          )}
        >
          <TrendIcon className="size-4" />
          {trend.label}
        </p>
      ) : null}
      {hint ? <p className="text-13 text-muted">{hint}</p> : null}
    </div>
  );
}
