'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

export type SegmentedOption<V extends string> = { value: V; label: ReactNode; count?: number };

export type SegmentedControlProps<V extends string> = {
  /** Names the radio group, e.g. "View". */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  name?: string;
  className?: string;
};

/**
 * One choice out of a few (Chart / Table). Native radios underneath, so arrow keys move
 * between segments and the checked one is announced.
 */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onValueChange,
  name,
  className,
}: SegmentedControlProps<V>) {
  const generated = useId();
  const groupName = name ?? generated;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-full bg-surface-2 p-1', className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            // 36 px segment, 44 px target: the ::before reaches into the 4 px padding.
            'relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-14 font-semibold text-ink-2',
            'before:absolute before:inset-x-0 before:-inset-y-1',
            'has-checked:bg-surface has-checked:text-ink has-checked:shadow-raised',
            'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
            'motion-safe:transition-colors',
          )}
        >
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={option.value === value}
            onChange={() => onValueChange(option.value)}
            className="sr-only"
          />
          {option.label}
          {option.count !== undefined ? (
            <span className="text-muted tabular-nums">{option.count}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
