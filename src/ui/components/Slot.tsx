import { cloneElement, isValidElement, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

type SlotProps = { children?: ReactNode; className?: string; [prop: string]: unknown };
type ChildProps = Record<string, unknown> & { className?: string };

/**
 * Renders its only child with the slot's props merged in, for `asChild` (a Button that is
 * really a link). Classes are joined; event handlers run the child's first, then the slot's.
 */
export function Slot({ children, className, ...slotProps }: SlotProps) {
  if (!isValidElement<ChildProps>(children)) {
    throw new Error('asChild expects exactly one React element child');
  }
  const childProps = children.props;
  const merged: ChildProps = { ...slotProps, ...childProps };
  for (const [key, slotValue] of Object.entries(slotProps)) {
    const childValue = childProps[key];
    if (
      /^on[A-Z]/.test(key) &&
      typeof slotValue === 'function' &&
      typeof childValue === 'function'
    ) {
      merged[key] = (...args: unknown[]) => {
        childValue(...args);
        slotValue(...args);
      };
    }
  }
  merged.className = cn(className, childProps.className);
  return cloneElement(children, merged);
}
