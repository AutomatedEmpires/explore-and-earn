import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { TriangleAlert, type IconComponent } from '@/ui/icons';

export type ErrorStateProps = {
  icon?: IconComponent;
  title?: string;
  description?: ReactNode;
  /** A retry Button or a way back. */
  action?: ReactNode;
  titleAs?: 'h1' | 'h2' | 'h3';
  /** `alert` announces the error when it appears; use `none` for errors shown on page load. */
  announce?: 'alert' | 'none';
  className?: string;
};

/** An error is always an icon plus text, never color alone (product spec section 3). */
export function ErrorState({
  icon: Icon = TriangleAlert,
  title = 'Something went wrong',
  description,
  action,
  titleAs: Title = 'h2',
  announce = 'alert',
  className,
}: ErrorStateProps) {
  return (
    <div
      role={announce === 'alert' ? 'alert' : undefined}
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-lg bg-danger-bg text-danger">
        <Icon className="size-6" />
      </span>
      <Title className="text-17 font-bold text-ink">{title}</Title>
      {description ? <div className="text-15 text-muted">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
