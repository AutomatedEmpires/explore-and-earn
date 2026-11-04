'use client';

// The seeker shell (product spec section 15.1):
// - phones: the top bar (wordmark; Community, Inbox and Notifications) and the pinned bottom
//   tabs Seek, Swipe, Map and Profile;
// - desktop: one top bar, Seek, Swipe, Map and Community on the left, Inbox, Notifications and
//   the avatar menu (with Profile) on the right.
// Signed-out visitors see "Sign in" instead of Inbox and Notifications.
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLiveCounts, type Counts } from '@/app/_components/useLiveCounts';
import { BottomNav, Button, IconLink, TopBar, type NavItem } from '@/ui/components';
import { seekerNavIcons as icons } from '@/ui/nav-icons';
import { SkipLink } from '@/ui/patterns/SkipLink';

function withCount(label: string, count: number): string {
  return count > 0 ? `${label}, ${count} unread` : label;
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DISCOVERY = [
  { href: '/', label: 'Seek', icon: icons.seek },
  { href: '/swipe', label: 'Swipe', icon: icons.swipe },
  { href: '/map', label: 'Map', icon: icons.map },
] as const;

export type SeekerShellProps = {
  signedIn: boolean;
  initialCounts: Counts;
  children: ReactNode;
};

export function SeekerShell({ signedIn, initialCounts, children }: SeekerShellProps) {
  const pathname = usePathname();
  const counts = useLiveCounts(signedIn, initialCounts);
  const current = (href: string) => isCurrent(pathname, href);

  const topLinks = [...DISCOVERY, { href: '/community', label: 'Community' }].map((link) => ({
    href: link.href,
    label: link.label,
    current: current(link.href),
  }));
  const tabs: NavItem[] = [
    ...DISCOVERY,
    { href: '/profile', label: 'Profile', icon: icons.profile },
  ].map((item) => ({ ...item, current: current(item.href) }));

  // Community is a top-bar icon on phones; on desktop it is one of the links.
  const community = (
    <IconLink
      href="/community"
      label="Community"
      icon={icons.community}
      current={current('/community')}
      className="md:hidden"
    />
  );

  const actions = signedIn ? (
    <>
      {community}
      <IconLink
        href="/inbox"
        label={withCount('Inbox', counts.inbox)}
        icon={icons.inbox}
        badge={counts.inbox}
        current={current('/inbox')}
      />
      <IconLink
        href="/notifications"
        label={withCount('Notifications', counts.notifications)}
        icon={icons.notifications}
        badge={counts.notifications}
        current={current('/notifications')}
      />
      <div className="ml-1 hidden size-11 items-center justify-center md:flex">
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Link
              label="Profile"
              labelIcon={<icons.profile className="size-4" />}
              href="/profile"
            />
            <UserButton.Action label="manageAccount" />
            <UserButton.Action label="signOut" />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </>
  ) : (
    <>
      {community}
      <Button asChild variant="secondary" className="ml-1">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SkipLink />
      {/* The bar spans the window; its contents line up with the page column below. */}
      <div className="sticky top-0 z-30 border-b border-line bg-bg">
        <TopBar
          className="mx-auto w-full max-w-6xl md:pr-5 md:pl-8"
          links={topLinks}
          linksLabel="Main"
          actions={actions}
        />
      </div>
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16"
      >
        {children}
      </main>
      <BottomNav label="Main" items={tabs} className="fixed inset-x-0 bottom-0 z-30 md:hidden" />
    </div>
  );
}
