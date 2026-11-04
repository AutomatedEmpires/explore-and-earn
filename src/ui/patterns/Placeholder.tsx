import type { ReactNode } from 'react';
import { EmptyState } from '@/ui/components';
import { cn } from '@/ui/cn';
import type { IconComponent } from '@/ui/icons';

export type PlaceholderProps = {
  /** The screen's name, the page heading ("Seek", "Applicants"). */
  title: string;
  /** The sub-project that delivers the screen (product spec section 25). */
  subProject: number;
  /** That sub-project's name ("Discovery", "Host hiring"). */
  name: string;
  icon?: IconComponent;
  /** One or two sentences on what the screen will do. */
  description?: ReactNode;
  /** Anything that already works here, below the notice. */
  children?: ReactNode;
  className?: string;
};

/**
 * A navigation destination that isn't built yet: the page heading, then an empty state that
 * names the sub-project delivering it, "Coming in sub-project N: <name>". Placeholder pages are
 * hidden in production; the page calls notFound() there.
 */
export function Placeholder({
  title,
  subProject,
  name,
  icon,
  description,
  children,
  className,
}: PlaceholderProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <h1 className="text-28 font-extrabold tracking-tight text-ink">{title}</h1>
      <section className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState
          icon={icon}
          title={`Coming in sub-project ${subProject}: ${name}`}
          description={description}
          titleAs="h2"
          className="max-w-md py-14"
        />
      </section>
      {children}
    </div>
  );
}
