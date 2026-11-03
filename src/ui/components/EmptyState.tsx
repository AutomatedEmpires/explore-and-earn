import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Inbox, type IconComponent } from '@/ui/icons';

export type EmptyStateProps = {
  icon?: IconComponent;
  title: string;
  description?: ReactNode;
  /** A Button, usually the one next step. */
  action?: ReactNode;
  titleAs?: 'h1' | 'h2' | 'h3';
  className?: string;
};

/** Nothing here yet. Also the base of placeholder screens ("Coming in sub-project N: ..."). */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  titleAs: Title = 'h2',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
        <Icon className="size-6" />
      </span>
      <Title className="text-17 font-bold text-ink">{title}</Title>
      {description ? <div className="text-15 text-muted">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
