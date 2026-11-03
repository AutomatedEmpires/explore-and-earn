'use client';

import * as RadixSlider from '@radix-ui/react-slider';
import { useId, useState } from 'react';
import { cn } from '@/ui/cn';

export type SliderProps = {
  label: string;
  /** One value, or two for a range. */
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown beside the label and used as each thumb's aria-valuetext, e.g. `(v) => `${v} mi``. */
  formatValue?: (value: number) => string;
  /** Names for the thumbs of a range, e.g. ["Minimum pay", "Maximum pay"]. */
  thumbLabels?: readonly string[];
  disabled?: boolean;
  name?: string;
  className?: string;
};

export function Slider({
  label,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  formatValue = String,
  thumbLabels,
  disabled,
  name,
  className,
}: SliderProps) {
  const labelId = useId();
  const [inner, setInner] = useState<number[]>(defaultValue ?? value ?? [min]);
  const current = value ?? inner;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-14 font-semibold text-ink">
          {label}
        </span>
        <span className="text-14 font-bold text-ink tabular-nums">
          {current.map(formatValue).join(' – ')}
        </span>
      </div>
      <RadixSlider.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => {
          setInner(v);
          onValueChange?.(v);
        }}
        onValueCommit={onValueCommit}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        name={name}
        aria-labelledby={labelId}
        className="relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line">
          <RadixSlider.Range className="absolute h-full bg-primary" />
        </RadixSlider.Track>
        {current.map((v, i) => (
          <RadixSlider.Thumb
            key={i}
            aria-label={thumbLabels?.[i] ?? label}
            aria-valuetext={formatValue(v)}
            className={cn(
              'relative block size-6 cursor-grab rounded-full border-2 border-primary bg-surface shadow-raised',
              'before:absolute before:-inset-2.5 active:cursor-grabbing',
            )}
          />
        ))}
      </RadixSlider.Root>
    </div>
  );
}
