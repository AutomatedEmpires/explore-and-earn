import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Check, type IconComponent } from '@/ui/icons';

export type ChipTone = 'default' | 'success' | 'muted';

export type ChipProps = {
  /** Small upper-case first line, e.g. "Housing". */
  label: string;
  /** Bold second line, e.g. "Provided" or "$19/hr". */
  value: ReactNode;
  icon?: IconComponent;
  /** `success` is the green "Provided" and always shows a check, so it never relies on color. */
  tone?: ChipTone;
  /** Opens the chip's pop-up sheet. Without it the chip is static text. */
  onOpen?: () => void;
  'aria-label'?: string;
  className?: string;
};

const valueTone: Record<ChipTone, string> = {
  default: 'text-ink',
  success: 'text-success',
  muted: 'font-semibold text-muted',
};

/** The two-line pop-up chip of the shared card (product spec section 4). */
export function Chip({
  label,
  value,
  icon: Icon,
  tone = 'default',
  onOpen,
  className,
  ...aria
}: ChipProps) {
  const content = (
    <>
      <span className="flex items-center gap-1 text-12 leading-none font-bold tracking-wider text-muted uppercase">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </span>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1 text-14 leading-tight font-bold',
          valueTone[tone],
        )}
      >
        {tone === 'success' ? <Check className="size-3.5 shrink-0" strokeWidth={3} /> : null}
        <span className="truncate">{value}</span>
      </span>
    </>
  );
  const classes = cn(
    'flex h-14 min-w-0 flex-col items-start justify-center gap-1 rounded-lg border border-line bg-bg px-2.5 text-left',
    className,
  );
  if (!onOpen) {
    return <div className={classes}>{content}</div>;
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={cn(classes, 'hover:bg-surface-2 motion-safe:transition-colors')}
      {...aria}
    >
      {content}
    </button>
  );
}
