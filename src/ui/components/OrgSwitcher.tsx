'use client';

import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { cn } from '@/ui/cn';
import { Check, ChevronsUpDown, Plus } from '@/ui/icons';
import { OrgLogo } from './OrgLogo';

export type OrgOption = { id: string; name: string; logoSrc?: string | null; roleLabel?: string };

export type OrgSwitcherProps = {
  orgs: readonly OrgOption[];
  currentId: string;
  onSelect: (orgId: string) => void;
  /** Shows "Create organization" at the bottom of the list. */
  onCreate?: () => void;
  /** Logo only (the mobile top bar). */
  compact?: boolean;
  className?: string;
};

/** Presentational organization switcher; the host shell wires it to Clerk. */
export function OrgSwitcher({
  orgs,
  currentId,
  onSelect,
  onCreate,
  compact = false,
  className,
}: OrgSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = orgs.find((o) => o.id === currentId) ?? orgs[0];
  if (!current) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* Named by its text, so the name contains what is shown (WCAG 2.5.3, label in name). */}
      <Popover.Trigger
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-md text-left hover:bg-surface-2 motion-safe:transition-colors',
          compact ? 'size-11 justify-center' : 'w-full px-2 py-1.5',
          className,
        )}
      >
        <span className="sr-only">
          {compact
            ? `Switch organization, current: ${current.name}`
            : 'Switch organization, current: '}
        </span>
        <OrgLogo name={current.name} src={current.logoSrc} size="sm" decorative />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-15 font-bold text-ink">{current.name}</span>
              {current.roleLabel ? (
                <span className="block text-13 text-muted">{current.roleLabel}</span>
              ) : null}
            </span>
            <ChevronsUpDown className="size-4 text-muted" />
          </>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-lg border border-line bg-surface p-1.5 shadow-overlay motion-safe:data-[state=closed]:animate-pop-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <ul aria-label="Organizations" className="flex flex-col gap-0.5">
            {orgs.map((org) => {
              const selected = org.id === current.id;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      setOpen(false);
                      if (!selected) onSelect(org.id);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-surface-2"
                  >
                    <OrgLogo name={org.name} src={org.logoSrc} size="sm" decorative />
                    <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink">
                      {org.name}
                    </span>
                    {selected ? (
                      <>
                        <Check className="size-4 text-ink" />
                        <span className="sr-only">(current)</span>
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {onCreate ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-md border-t border-line px-2 text-left text-15 font-semibold text-ink hover:bg-surface-2"
            >
              <span className="flex size-8 items-center justify-center rounded-sm bg-surface-2">
                <Plus className="size-4" />
              </span>
              Create organization
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
