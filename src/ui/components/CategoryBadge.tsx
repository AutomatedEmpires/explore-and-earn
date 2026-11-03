import { categoryMeta, type Category } from '@/ui/categories';
import { cn } from '@/ui/cn';

export type CategoryBadgeProps = {
  category: Category;
  className?: string;
};

/** The category tint with its icon and label; color never appears without the icon. */
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const { label, icon: Icon, badge } = categoryMeta[category];
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-13 font-bold whitespace-nowrap',
        badge,
        className,
      )}
    >
      <Icon className="size-3.75" />
      {label}
    </span>
  );
}

export type CategoryListBadgeProps = {
  categories: readonly Category[];
  className?: string;
};

/** Several categories on one neutral badge, each icon in its color (candidate interests). */
export function CategoryListBadge({ categories, className }: CategoryListBadgeProps) {
  if (categories.length === 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-2 text-13 font-bold whitespace-nowrap text-ink',
        className,
      )}
    >
      {categories.map((c) => {
        const { icon: Icon, solidText } = categoryMeta[c];
        return <Icon key={c} className={cn('size-3.75', solidText)} />;
      })}
      {categories.map((c) => categoryMeta[c].label).join(', ')}
    </span>
  );
}
