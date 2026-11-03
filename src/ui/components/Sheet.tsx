'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { X, type IconComponent } from '@/ui/icons';
import { IconButton } from './IconButton';

export type SheetProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional element that opens the sheet (rendered asChild, so pass a Button or Chip). */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  children: ReactNode;
  /** Pinned below the scrolling body, e.g. "All housing details on the listing". */
  footer?: ReactNode;
  className?: string;
};

/**
 * The chip pop-up: a bottom sheet below 768 px, a right-side panel from 768 px (md) up.
 * Radix Dialog handles focus trapping, Escape and returning focus to the trigger.
 */
export function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  icon: Icon,
  children,
  footer,
  className,
}: SheetProps) {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-scrim motion-safe:data-[state=closed]:animate-fade-out motion-safe:data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl bg-surface text-ink shadow-overlay',
            'motion-safe:data-[state=closed]:animate-sheet-down motion-safe:data-[state=open]:animate-sheet-up',
            'md:top-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:max-w-md md:rounded-none md:rounded-l-2xl',
            'motion-safe:md:data-[state=closed]:animate-panel-out motion-safe:md:data-[state=open]:animate-panel-in',
            className,
          )}
        >
          <div className="px-4 pt-2.5 md:px-6 md:pt-6">
            <span
              aria-hidden="true"
              className="mx-auto block h-1.25 w-10 rounded-full bg-line md:hidden"
            />
            <div className="mt-3.5 flex items-center gap-3 md:mt-0">
              {Icon ? (
                <span className="flex size-10.5 shrink-0 items-center justify-center rounded-md bg-surface-2">
                  <Icon className="size-5.5" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <RadixDialog.Title className="text-21 font-extrabold">{title}</RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-0.5 text-13 text-muted">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <RadixDialog.Close asChild>
                <IconButton icon={X} label="Close" variant="subtle" />
              </RadixDialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 md:px-6">{children}</div>
          {footer ? (
            <div className="border-t border-line px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
