import { cn } from '@/ui/cn';
import { Img } from './Img';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<AvatarSize, string> = {
  sm: 'size-8 text-14',
  md: 'size-10 text-14',
  lg: 'size-13 text-17',
  xl: 'size-15 text-19',
};

/** "Maya Rodriguez" -> "MR", "cher" -> "C". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export type AvatarProps = {
  name: string;
  /** Without a src (or when the person hides their photo) the avatar shows initials. */
  src?: string | null;
  size?: AvatarSize;
  /** A surface-colored border, for avatars that overlap a cover photo. */
  ring?: boolean;
  /** Hide from assistive tech when the name is already next to it. */
  decorative?: boolean;
  className?: string;
};

/** People are round (product spec section 22). */
export function Avatar({
  name,
  src,
  size = 'md',
  ring = false,
  decorative = false,
  className,
}: AvatarProps) {
  const classes = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-bold text-ink-2',
    sizes[size],
    ring && 'border-3 border-surface shadow-raised',
    className,
  );
  if (src) {
    return <Img src={src} alt={decorative ? '' : name} className={cn(classes, 'object-cover')} />;
  }
  return (
    <span
      className={classes}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      {initials(name)}
    </span>
  );
}
