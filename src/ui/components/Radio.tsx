'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { CircleAlert } from '@/ui/icons';

export type RadioGroupProps = {
  legend: ReactNode;
  hideLegend?: boolean;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A fieldset of Radios; the legend names the group. */
export function RadioGroup({ legend, hideLegend, error, children, className }: RadioGroupProps) {
  return (
    <fieldset className={cn('flex flex-col', className)}>
      <legend className={cn('mb-1 text-14 font-semibold text-ink', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-13 font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export type RadioProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
};

/** A native radio with a 44 px row as its target. Give radios in one group the same name. */
export function Radio({ id, label, description, className, ...props }: RadioProps) {
  const generated = useId();
  const radioId = id ?? generated;
  return (
    <label
      htmlFor={radioId}
      className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-2.5', className)}
    >
      <span className="relative mt-px flex size-5 shrink-0">
        <input
          id={radioId}
          type="radio"
          aria-describedby={description ? `${radioId}-description` : undefined}
          className={cn(
            'peer size-5 cursor-pointer appearance-none rounded-full border-2 border-line-strong bg-surface',
            'checked:border-primary disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors',
          )}
          {...props}
        />
        <span className="pointer-events-none absolute inset-0 m-auto size-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-15 font-semibold text-ink">{label}</span>
        {description ? (
          <span id={`${radioId}-description`} className="text-13 text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
