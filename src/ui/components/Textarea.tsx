'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { controlClass, Field, fieldDescriptionIds } from './Field';

export type TextareaProps = ComponentProps<'textarea'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  fieldClassName?: string;
};

export function Textarea({
  id,
  label,
  hint,
  error,
  hideLabel,
  required,
  rows = 4,
  className,
  fieldClassName,
  ...props
}: TextareaProps) {
  const generated = useId();
  const textareaId = id ?? generated;
  return (
    <Field
      id={textareaId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescriptionIds(textareaId, hint, error)}
        className={cn(controlClass, 'min-h-28 py-3 leading-normal', className)}
        {...props}
      />
    </Field>
  );
}
