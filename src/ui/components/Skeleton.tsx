import { cn } from '@/ui/cn';

export type SkeletonProps = {
  shape?: 'rect' | 'circle' | 'text';
  className?: string;
};

/** A loading placeholder; hidden from assistive tech (announce loading on the container). */
export function Skeleton({ shape = 'rect', className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-2 motion-safe:animate-pulse',
        shape === 'circle' && 'rounded-full',
        shape === 'rect' && 'rounded-md',
        shape === 'text' && 'h-4 rounded-sm',
        className,
      )}
    />
  );
}

/** The shared card while it loads. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('overflow-hidden rounded-xl bg-surface shadow-card', className)}
    >
      <Skeleton className="h-47 rounded-none" />
      <div className="flex flex-col gap-2 px-4 pt-9 pb-4">
        <Skeleton shape="text" className="h-5 w-2/3" />
        <Skeleton shape="text" className="w-1/2" />
        <Skeleton shape="text" className="w-1/3" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        <Skeleton className="mt-2 h-12 rounded-full" />
      </div>
    </div>
  );
}
