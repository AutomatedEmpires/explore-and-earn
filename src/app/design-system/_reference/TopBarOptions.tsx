'use client';

// The top bar options (product spec section 15.1 leaves the top bar open): icons only, icons
// with a role badge, or a hamburger menu with a role badge. Each at phone width, for a seeker and
// a host, in light and dark.
import { useState } from 'react';
import { IconButton, Input, OrgSwitcher, Sheet, TopBar, type TopBarRole } from '@/ui/components';
import { ChevronRight, Menu, Search, type IconComponent } from '@/ui/icons';
import { hostNavIcons as host, seekerNavIcons as seeker } from '@/ui/nav-icons';
import { themes, type Theme } from '@/ui/tokens';
import { hostOrgs } from '../_gallery/samples';

export type BarOption = 'icons' | 'badge' | 'menu';

export const barOptions: { id: BarOption; letter: string; title: string; note: string }[] = [
  {
    id: 'icons',
    letter: 'A',
    title: 'Icons only',
    note: 'The calmest bar, with every action one tap away. Seeker and host bars look alike; only the screen below tells them apart.',
  },
  {
    id: 'badge',
    letter: 'B',
    title: 'Icons with a role badge',
    note: 'The same actions plus a small Seeker or Host badge, so whose view it is shows at a glance, on a shared device or in a screenshot. About 60 px wider. The design board’s artboards use this one.',
  },
  {
    id: 'menu',
    letter: 'C',
    title: 'Hamburger menu with a role badge',
    note: 'The fewest icons: Inbox stays in the bar and the menu holds the rest. Reaching Community or Notifications takes one more tap, and their counts sit behind the menu.',
  },
];

type MenuLink = { label: string; icon: IconComponent; detail?: string };

const menuLinks: Record<'seeker' | 'host', MenuLink[]> = {
  seeker: [
    { label: 'Community', icon: seeker.community },
    { label: 'Inbox', icon: seeker.inbox, detail: '2 unread' },
    { label: 'Notifications', icon: seeker.notifications },
    { label: 'Profile', icon: seeker.profile },
    { label: 'Settings', icon: seeker.settings },
  ],
  host: [
    { label: 'Home', icon: host.home },
    { label: 'Applicants', icon: host.applicants },
    { label: 'Messages', icon: host.messages, detail: '3 unread' },
    { label: 'Listings', icon: host.listings },
    { label: 'Notifications', icon: host.notifications },
    { label: 'Settings', icon: host.settings },
  ],
};

function MenuSheet({ role }: { role: 'seeker' | 'host' }) {
  return (
    <Sheet title="Menu" trigger={<IconButton icon={Menu} label="Menu" />}>
      <nav aria-label="Menu">
        <ul className="flex flex-col gap-0.5">
          {menuLinks[role].map(({ label, icon: Icon, detail }) => (
            <li key={label}>
              <a
                href={`#${label.toLowerCase()}`}
                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-16 font-semibold text-ink no-underline hover:bg-surface-2"
              >
                <Icon className="size-5" />
                <span className="flex-1">
                  {label}
                  {detail ? <span className="sr-only">, {detail}</span> : null}
                </span>
                {detail ? (
                  <span aria-hidden="true" className="text-13 font-semibold text-muted">
                    {detail}
                  </span>
                ) : null}
                <ChevronRight className="size-4 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </Sheet>
  );
}

function HostSwitcher() {
  const [current, setCurrent] = useState(hostOrgs[0]?.id ?? '');
  return <OrgSwitcher orgs={hostOrgs} currentId={current} onSelect={setCurrent} compact />;
}

function Bar({ option, role }: { option: BarOption; role: 'seeker' | 'host' }) {
  const badge: TopBarRole | undefined = option === 'icons' ? undefined : role;
  const inbox = <IconButton icon={seeker.inbox} label="Inbox, 2 unread" badge={2} />;
  if (option === 'menu') {
    return (
      <TopBar
        role={badge}
        className="pl-1"
        start={<MenuSheet role={role} />}
        actions={role === 'seeker' ? inbox : <HostSwitcher />}
      />
    );
  }
  return (
    <TopBar
      role={badge}
      actions={
        role === 'seeker' ? (
          <>
            <IconButton icon={seeker.community} label="Community" />
            {inbox}
            <IconButton icon={seeker.notifications} label="Notifications" />
          </>
        ) : (
          <>
            <IconButton icon={host.notifications} label="Notifications" />
            <HostSwitcher />
          </>
        )
      }
    />
  );
}

function Frame({
  option,
  role,
  theme,
}: {
  option: BarOption;
  role: 'seeker' | 'host';
  theme: Theme;
}) {
  return (
    <figure
      data-theme={theme}
      className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-line"
    >
      <figcaption className="border-b border-line px-4 py-2 text-12 leading-none font-bold tracking-wider text-muted uppercase">
        {role === 'seeker' ? 'Seeker' : 'Host'} · {theme === 'light' ? 'Light' : 'Dark'}
      </figcaption>
      <Bar option={option} role={role} />
      <div className="px-4 pt-1 pb-4">
        {role === 'seeker' ? (
          <Input
            label="Search jobs"
            hideLabel
            type="search"
            leadingIcon={Search}
            placeholder="Search jobs, places, employers"
          />
        ) : (
          <p className="text-21 font-extrabold text-ink">Applicants</p>
        )}
      </div>
    </figure>
  );
}

export function TopBarOptions() {
  return (
    // On desktop each option is a column; a subgrid keeps the same frame on the same row.
    <ul className="grid gap-10 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-4">
      {barOptions.map((o) => (
        <li key={o.id} className="flex flex-col gap-4 lg:row-span-5 lg:grid lg:grid-rows-subgrid">
          <div className="flex flex-col gap-1">
            <h2 className="text-21 font-extrabold text-ink">
              <span className="text-muted">{o.letter} · </span>
              {o.title}
            </h2>
            <p className="text-14 text-ink-2">{o.note}</p>
          </div>
          {(['seeker', 'host'] as const).map((role) =>
            themes.map((theme) => (
              <Frame key={`${role}-${theme}`} option={o.id} role={role} theme={theme} />
            )),
          )}
        </li>
      ))}
    </ul>
  );
}
