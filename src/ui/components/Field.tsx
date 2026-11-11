import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { CircleAlert } from '@/ui/icons';

export type FieldProps = {
  /** The id of the control the label points at. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Shown with an icon, never by color alone; also sets the control's aria-invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Keep the label for screen readers only (e.g. the Seek search box). */
  hideLabel?: boolean;
  /** Shown at the end of the label row, e.g. a slider's current value. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function fieldDescriptionIds(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** Label, control, hint and error message, wired together for assistive tech. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  hideLabel = false,
  aside,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className={cn('flex items-baseline justify-between gap-3', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="text-14 font-semibold text-ink">
          {label}
          {required ? (
            <span className="text-muted">
              <span aria-hidden="true"> *</span>
              <span className="sr-only"> (required)</span>
            </span>
          ) : null}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-13 font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span id={`${id}-error`}>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-13 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared look of text-like controls: 3:1 border, token focus ring, danger border on error. */
export const controlClass = cn(
  'w-full rounded-lg border border-line-strong bg-surface px-3.5 text-16 text-ink placeholder:text-muted',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70',
  'aria-[invalid=true]:border-danger motion-safe:transition-colors',
);
