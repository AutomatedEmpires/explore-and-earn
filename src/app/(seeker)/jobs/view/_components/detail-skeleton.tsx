// The listing while it loads (Figma 178:16292, 178:16360): the cover, the badge and title, the
// host row and the seven deal lines, in the detail's own sizes.
import { Skeleton } from '@/ui/components';

export function DetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the job"
      className="mx-auto flex max-w-180 flex-col gap-4"
    >
      <Skeleton className="h-50 rounded-xl md:h-75" />
      <Skeleton className="h-7 w-22 rounded-full" />
      <Skeleton className="h-8.5 w-65 max-w-full" />
      <Skeleton className="h-15.5 rounded-lg" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} shape="text" className="h-5 w-55 max-w-full" />
        ))}
      </div>
    </div>
  );
}
