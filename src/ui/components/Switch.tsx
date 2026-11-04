'use client';

import * as RadixSwitch from '@radix-ui/react-switch';
import { useId, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

export type SwitchProps = {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
};

/** An on/off setting (role="switch"), label on the left, control on the right. */
export function Switch({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  name,
  id,
  className,
}: SwitchProps) {
  const generated = useId();
  const switchId = id ?? generated;
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 py-1.5', className)}>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={switchId} className="cursor-pointer text-15 font-semibold text-ink">
          {label}
        </label>
        {description ? (
          <span id={`${switchId}-description`} className="text-13 text-muted">
            {description}
          </span>
        ) : null}
      </div>
      <RadixSwitch.Root
        id={switchId}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${switchId}-description` : undefined}
        className={cn(
          // 28 px track, 44 px target.
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5',
          'before:absolute before:-inset-2',
          'bg-line-strong data-[state=checked]:bg-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors',
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'block size-6 rounded-full bg-surface shadow-raised',
            'data-[state=checked]:translate-x-5 motion-safe:transition-transform motion-safe:duration-150',
          )}
        />
      </RadixSwitch.Root>
    </div>
  );
}
