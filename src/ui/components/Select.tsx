'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { useId, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Check, ChevronDown } from '@/ui/icons';
import { controlClass, Field, fieldDescriptionIds } from './Field';

export type SelectOption<V extends string> = { value: V; label: string; disabled?: boolean };

export type SelectProps<V extends string> = {
  label: ReactNode;
  options: readonly SelectOption<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  name?: string;
  id?: string;
  className?: string;
};

/** A single-choice list (Radix Select), styled like the other form controls. */
export function Select<V extends string>({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Choose one',
  hint,
  error,
  required,
  disabled,
  hideLabel,
  name,
  id,
  className,
}: SelectProps<V>) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field
      id={selectId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={className}
    >
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => onValueChange?.(v as V)}
        required={required}
        disabled={disabled}
        name={name}
      >
        <RadixSelect.Trigger
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescriptionIds(selectId, hint, error)}
          className={cn(
            controlClass,
            'flex h-12 items-center justify-between gap-2 text-left data-[placeholder]:text-muted',
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown className="size-4.5 text-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-line bg-surface shadow-overlay motion-safe:data-[state=open]:animate-pop-in"
          >
            <RadixSelect.Viewport className="p-1.5">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'relative flex min-h-11 cursor-pointer items-center rounded-md pr-3 pl-9 text-15 text-ink outline-none select-none',
                    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2',
                  )}
                >
                  <RadixSelect.ItemIndicator className="absolute left-3 flex">
                    <Check className="size-4" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </Field>
  );
}
