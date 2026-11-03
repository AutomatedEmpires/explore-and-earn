'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';
import { controlClass, Field, fieldDescriptionIds } from './Field';

export type InputProps = Omit<ComponentProps<'input'>, 'size'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  leadingIcon?: IconComponent;
  fieldClassName?: string;
};

export function Input({
  id,
  label,
  hint,
  error,
  hideLabel,
  leadingIcon: Icon,
  required,
  className,
  fieldClassName,
  ...props
}: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4.75 -translate-y-1/2 text-muted" />
        ) : null}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescriptionIds(inputId, hint, error)}
          className={cn(controlClass, 'h-12', Icon && 'pl-10.5', className)}
          {...props}
        />
      </div>
    </Field>
  );
}
