'use client';

// Form fields bound to the builder draft. Each one shows what the host typed (`raw`) before the
// saved value, and its error only once the field was left or its step was checked.
import type { ReactNode } from 'react';
import { Checkbox, Input, Radio, RadioGroup, Select, Switch, Textarea } from '@/ui/components';
import type { BuilderContext, Errors, Raw } from '../_lib/model';
import { getPath, type Json } from '../_lib/paths';
import type { Destination, HostLocation, Occupation, TeamMember } from '../_lib/sample';
import type { usePhotos } from './usePhotos';

export type References = {
  occupations: Occupation[];
  destinations: Destination[];
  locations: HostLocation[] | null;
  team: TeamMember[] | null;
  orgName: string;
};

export type Form = {
  listingId: string;
  draft: Json;
  raw: Raw;
  ctx: BuilderContext;
  phone: boolean;
  refs: References;
  photos: ReturnType<typeof usePhotos>;
  /** Sets a value; `text` keeps what was typed under its own key. */
  set: (path: string, value: unknown, text?: { key: string; value: string }) => void;
  /** Several values as one edit. */
  setMany: (entries: [string, unknown][], text?: { key: string; value: string }) => void;
  /** Keeps what was typed without changing the draft. */
  setText: (key: string, value: string) => void;
  /** Shows a field's error from now on. */
  touch: (key: string) => void;
  /** The error to show for a field, if any. */
  error: (key: string) => string | undefined;
  allErrors: Errors;
  addLocation: (loc: HostLocation) => void;
  /** Saves every section now; true when nothing is left to save. */
  flushAll: () => Promise<boolean>;
};

/** The DOM id of a field ('housing.cost.amount' -> 'f-housing-cost-amount'). */
export const fieldId = (key: string) => `f-${key.replace(/[^A-Za-z0-9]+/g, '-')}`;

export function TextField({
  form,
  path,
  label,
  hint,
  required,
  placeholder,
  inputMode,
  type = 'text',
  autoComplete = 'off',
  maxLength,
  text,
  onText,
  className,
}: {
  form: Form;
  path: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'url' | 'email';
  type?: 'text' | 'date' | 'url';
  autoComplete?: string;
  maxLength?: number;
  /** For a parsed input: its key in `raw` and how its saved value reads. */
  text?: { key: string; shown: string };
  /** For a parsed input: what a change stores. */
  onText?: (value: string) => void;
  className?: string;
}) {
  const key = text?.key ?? path;
  const saved = getPath(form.draft, path);
  const value = text
    ? (form.raw[text.key] ?? text.shown)
    : typeof saved === 'string'
      ? saved
      : typeof saved === 'number'
        ? String(saved)
        : '';
  return (
    <Input
      id={fieldId(key)}
      label={label}
      hint={hint}
      required={required}
      placeholder={placeholder}
      inputMode={inputMode}
      type={type}
      autoComplete={autoComplete}
      maxLength={maxLength}
      value={value}
      error={form.error(key)}
      fieldClassName={className}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (onText) onText(v);
        else form.set(path, v);
      }}
      onBlur={() => form.touch(key)}
    />
  );
}

export function AreaField({
  form,
  path,
  label,
  hint,
  required,
  placeholder,
  rows = 4,
  maxLength,
  text,
  onText,
}: {
  form: Form;
  path: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  text?: { key: string; shown: string };
  onText?: (value: string) => void;
}) {
  const key = text?.key ?? path;
  const saved = getPath(form.draft, path);
  const value = text ? (form.raw[text.key] ?? text.shown) : typeof saved === 'string' ? saved : '';
  return (
    <Textarea
      id={fieldId(key)}
      label={label}
      hint={hint}
      required={required}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      value={value}
      error={form.error(key)}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (onText) onText(v);
        else form.set(path, v === '' ? null : v);
      }}
      onBlur={() => form.touch(key)}
    />
  );
}

export function ChoiceField<V extends string>({
  form,
  path,
  label,
  options,
  hint,
  required,
  placeholder,
  onChoose,
  errorKey,
}: {
  form: Form;
  path: string;
  label: ReactNode;
  options: readonly { value: V; label: string }[];
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  onChoose?: (value: V) => void;
  errorKey?: string;
}) {
  const key = errorKey ?? path;
  const saved = getPath(form.draft, path);
  return (
    <Select<V>
      id={fieldId(key)}
      label={label}
      hint={hint}
      required={required}
      placeholder={placeholder}
      options={options}
      value={typeof saved === 'string' ? (saved as V) : undefined}
      error={form.error(key)}
      onValueChange={(v) => {
        if (onChoose) onChoose(v);
        else form.set(path, v);
        form.touch(key);
      }}
    />
  );
}

export function RadioField<V extends string>({
  form,
  path,
  legend,
  options,
  required,
  onChoose,
  value,
  errorKey,
}: {
  form: Form;
  path: string;
  legend: string;
  options: readonly { value: V; label: string; description?: string }[];
  required?: boolean;
  onChoose?: (value: V) => void;
  /** The chosen option when it is not the string stored at `path`. */
  value?: V;
  errorKey?: string;
}) {
  const key = errorKey ?? path;
  const saved = value ?? getPath(form.draft, path);
  return (
    <RadioGroup legend={required ? `${legend} *` : legend} error={form.error(key)}>
      <div id={fieldId(key)} className="flex flex-col">
        {options.map((o) => (
          <Radio
            key={o.value}
            name={fieldId(key)}
            value={o.value}
            label={o.label}
            description={o.description}
            checked={saved === o.value}
            onChange={() => {
              if (onChoose) onChoose(o.value);
              else form.set(path, o.value);
              form.touch(key);
            }}
          />
        ))}
      </div>
    </RadioGroup>
  );
}

export function SwitchField({
  form,
  path,
  label,
  description,
  onToggle,
}: {
  form: Form;
  path: string;
  label: string;
  description?: string;
  onToggle?: (on: boolean) => void;
}) {
  return (
    <Switch
      id={fieldId(path)}
      label={label}
      description={description}
      checked={getPath(form.draft, path) === true}
      onCheckedChange={(on) => (onToggle ? onToggle(on) : form.set(path, on))}
    />
  );
}

export function CheckField({
  form,
  path,
  label,
  description,
  checked,
  onToggle,
}: {
  form: Form;
  path: string;
  label: string;
  description?: string;
  checked?: boolean;
  onToggle?: (on: boolean) => void;
}) {
  return (
    <Checkbox
      id={fieldId(`${path}-${label}`)}
      label={label}
      description={description}
      checked={checked ?? getPath(form.draft, path) === true}
      onChange={(e) => {
        const on = e.currentTarget.checked;
        if (onToggle) onToggle(on);
        else form.set(path, on);
      }}
    />
  );
}

/** A group heading with its hint, for checklists and photo grids. */
export function GroupLabel({
  id,
  label,
  hint,
  required,
}: {
  id?: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p id={id} className="text-14 font-semibold text-ink">
        {label}
        {required ? (
          <span className="text-muted">
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </span>
        ) : null}
      </p>
      {hint ? <p className="text-14 text-muted">{hint}</p> : null}
    </div>
  );
}
