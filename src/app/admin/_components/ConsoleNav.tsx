'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Badge, IconButton, Sheet, Sidebar, TopBar, Wordmark } from '@/ui/components';
import type { SidebarItem } from '@/ui/components';
import { Menu } from '@/ui/icons';
import { operatorNavIcons as icons } from '@/ui/nav-icons';
import { ConsoleSignOut } from './ConsoleSignOut';
import { ShiftSwitch } from './ShiftSwitch';

export type ConsoleNavProps = {
  operator: {
    userId: string;
    name: string;
    role: 'owner' | 'operator';
    shiftStatus: 'on_shift' | 'away';
  };
  /** Placeholder destinations (Users & orgs) are hidden in prod. */
  showPlaceholders: boolean;
};

const NAV_LABEL = 'Console';

/** The browser path without the /admin prefix the proxy's rewrite adds (or a direct visit). */
function consolePath(pathname: string): string {
  const stripped = pathname.replace(/^\/admin(?=\/|$)/, '');
  return stripped === '' ? '/' : stripped;
}

function navItems(pathname: string, showPlaceholders: boolean): SidebarItem[] {
  const path = consolePath(pathname);
  const at = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  const items: SidebarItem[] = [
    { href: '/', label: 'Home', icon: icons.home },
    { href: '/queues', label: 'Review queues', icon: icons.queues },
    ...(showPlaceholders ? [{ href: '/users', label: 'Users & orgs', icon: icons.users }] : []),
    { href: '/audit', label: 'Audit log', icon: icons.audit },
    { href: '/operators', label: 'Operators', icon: icons.operators },
    { href: '/settings', label: 'Settings', icon: icons.settings },
  ];
  return items.map((item) => ({ ...item, current: at(item.href) }));
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <Wordmark />
      <Badge size="sm" tone="inverse">
        Operator
      </Badge>
    </div>
  );
}

function Account({ operator }: Pick<ConsoleNavProps, 'operator'>) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 pt-3">
      <div className="flex items-center gap-3">
        <Avatar name={operator.name} size="md" decorative />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-15 font-semibold text-ink">{operator.name}</span>
          <span className="text-13 text-muted">
            {operator.role === 'owner' ? 'Owner' : 'Operator'}
          </span>
        </div>
      </div>
      <ShiftSwitch userId={operator.userId} shiftStatus={operator.shiftStatus} label="On shift" />
      <ConsoleSignOut className="justify-start px-3" />
    </div>
  );
}

/** The console's sidebar (md and up) and, on phones, a top bar whose menu opens the same links. */
export function ConsoleNav({ operator, showPlaceholders }: ConsoleNavProps) {
  const pathname = usePathname();
  const items = navItems(pathname, showPlaceholders);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Sidebar
        label={NAV_LABEL}
        items={items}
        header={
          <div className="px-3 pt-1 pb-2">
            <Brand />
          </div>
        }
        footer={<Account operator={operator} />}
        className="sticky top-0 hidden h-dvh md:flex"
      />
      <div className="sticky top-0 z-40 border-b border-line bg-bg md:hidden">
        <TopBar
          brand={<Brand />}
          actions={
            <Sheet
              open={open}
              onOpenChange={setOpen}
              title="Console"
              trigger={<IconButton icon={Menu} label="Open the console menu" />}
            >
              {/* Following a link closes the menu. */}
              <div
                onClickCapture={(e) => {
                  if (e.target instanceof Element && e.target.closest('a')) setOpen(false);
                }}
              >
                <Sidebar
                  label={NAV_LABEL}
                  items={items}
                  footer={<Account operator={operator} />}
                  className="w-full border-r-0 bg-transparent p-0 pb-4"
                />
              </div>
            </Sheet>
          }
        />
      </div>
    </>
  );
}
