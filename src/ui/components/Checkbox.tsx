'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Check, CircleAlert } from '@/ui/icons';

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
};

/** A native checkbox with a 44 px row as its target. */
export function Checkbox({ id, label, description, error, className, ...props }: CheckboxProps) {
  const generated = useId();
  const boxId = id ?? generated;
  const describedBy =
    [error ? `${boxId}-error` : null, description ? `${boxId}-description` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={boxId} className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
        <span className="relative mt-px flex size-5 shrink-0">
          <input
            id={boxId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'peer size-5 cursor-pointer appearance-none rounded-[0.375rem] border-2 border-line-strong bg-surface',
              'checked:border-primary checked:bg-primary aria-[invalid=true]:border-danger',
              'disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors',
            )}
            {...props}
          />
          <Check
            strokeWidth={3.5}
            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-on-primary opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-15 font-semibold text-ink">{label}</span>
          {description ? (
            <span id={`${boxId}-description`} className="text-13 text-muted">
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p className="flex items-start gap-1.5 pl-8 text-13 font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span id={`${boxId}-error`}>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
