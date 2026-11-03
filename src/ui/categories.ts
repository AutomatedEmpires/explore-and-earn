import { Anchor, Laptop, Leaf, Mountain, type IconComponent } from './icons';
import type { Category } from './tokens';

export { categories, type Category } from './tokens';

/** Category color always comes with its icon and label (product spec section 3). */
export const categoryMeta: Record<
  Category,
  { label: string; icon: IconComponent; badge: string; solidText: string }
> = {
  maritime: {
    label: 'Maritime',
    icon: Anchor,
    badge: 'bg-maritime-bg text-maritime-fg',
    solidText: 'text-maritime-solid',
  },
  seasonal: {
    label: 'Seasonal',
    icon: Mountain,
    badge: 'bg-seasonal-bg text-seasonal-fg',
    solidText: 'text-seasonal-solid',
  },
  farm: {
    label: 'Farm',
    icon: Leaf,
    badge: 'bg-farm-bg text-farm-fg',
    solidText: 'text-farm-solid',
  },
  remote: {
    label: 'Remote',
    icon: Laptop,
    badge: 'bg-remote-bg text-remote-fg',
    solidText: 'text-remote-solid',
  },
};
