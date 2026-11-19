import { cn } from '@/ui/cn';
import { initials } from './Avatar';
import { Img } from './Img';

export type OrgLogoSize = 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<OrgLogoSize, string> = {
  sm: 'size-8 rounded-sm text-14',
  md: 'size-10 rounded-md text-14',
  lg: 'size-13 rounded-lg text-17',
  xl: 'size-16 rounded-xl text-21',
};

export type OrgLogoProps = {
  name: string;
  src?: string | null;
  size?: OrgLogoSize;
  /** A surface-colored border, for logos that overlap a cover photo. */
  ring?: boolean;
  decorative?: boolean;
  className?: string;
};

/** Organizations are rounded squares (product spec section 22). */
export function OrgLogo({
  name,
  src,
  size = 'md',
  ring = false,
  decorative = false,
  className,
}: OrgLogoProps) {
  const classes = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-2 font-bold text-ink-2',
    sizes[size],
    ring && 'border-3 border-surface shadow-raised',
    className,
  );
  if (src) {
    return (
      <Img
        src={src}
        alt={decorative ? '' : `${name} logo`}
        className={cn(classes, 'object-cover')}
      />
    );
  }
  return (
    <span
      className={classes}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${name} logo` })}
    >
      {initials(name)}
    </span>
  );
}
