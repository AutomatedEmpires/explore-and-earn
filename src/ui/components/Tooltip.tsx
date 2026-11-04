'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

export type TooltipProps = {
  /** Extra information only; never the only name of a control (use IconButton's label). */
  content: ReactNode;
  /** The trigger, rendered asChild: a focusable element such as a Button or IconButton. */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className={cn(
              'z-50 max-w-xs rounded-md bg-primary px-2.5 py-1.5 text-13 font-semibold text-on-primary shadow-raised',
              'motion-safe:data-[state=closed]:animate-fade-out motion-safe:data-[state=delayed-open]:animate-pop-in',
              className,
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-primary" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
