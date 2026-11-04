'use client';

// The host workspace shell (product spec section 15.2):
// - desktop: a sidebar with the organization switcher above Home ... Settings, and the account
//   menu and Notifications below;
// - phones: the top bar of the design system's top bar options (the wordmark, then
//   Notifications and the organization's logo, which opens the switcher) and bottom tabs Home,
//   Applicants, Messages, Listings and More. The account (settings, sign out) is on More.
// Until an Owner or Admin sets up a passkey or two-step sign-in, the shell is `locked`: only the
// top bar and the security screen, with no way into the rest of the workspace.
import { UserButton, useOrganizationList } from '@clerk/nextjs';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLiveCounts } from '@/app/_components/useLiveCounts';
import {
  BottomNav,
  IconLink,
  OrgSwitcher,
  Sidebar,
  Skeleton,
  TopBar,
  Wordmark,
  type NavItem,
  type OrgOption,
  type SidebarItem,
} from '@/ui/components';
import { hostNavIcons } from '@/ui/nav-icons';
import { SkipLink } from '@/ui/patterns/SkipLink';
import {
  HOST_MORE,
  HOST_MORE_HREF,
  HOST_NAV,
  HOST_NOTIFICATIONS_HREF,
  HOST_TAB_HREFS,
  isHostCurrent,
} from './nav';

export type HostShellOrg = {
  /** The organization the server is showing (Clerk's ID). */
  clerkOrgId: string;
  /** The signed-in member's role in it, e.g. "Owner". */
  roleLabel: string;
};

/** Clerk's organization list behind the presentational OrgSwitcher. */
function HostOrgSwitcher({ org, compact = false }: { org: HostShellOrg; compact?: boolean }) {
  const router = useRouter();
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { pageSize: 50 },
  });

  if (!isLoaded || userMemberships.isLoading) {
    return <Skeleton className={compact ? 'size-11' : 'h-14 w-full'} />;
  }

  const orgs: OrgOption[] = (userMemberships.data ?? []).map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    logoSrc: m.organization.hasImage ? m.organization.imageUrl : null,
    roleLabel: m.organization.id === org.clerkOrgId ? org.roleLabel : undefined,
  }));

  return (
    <OrgSwitcher
      orgs={orgs}
      currentId={org.clerkOrgId}
      compact={compact}
      onSelect={(id) => {
        // The server reads the active organization from the session; re-render with it.
        void setActive({ organization: id }).then(() => router.refresh());
      }}
    />
  );
}

function withCount(label: string, count: number): string {
  return count > 0 ? `${label}, ${count} unread` : label;
}

function NotificationsLink({ count, current }: { count: number; current: boolean }) {
  return (
    <IconLink
      href={HOST_NOTIFICATIONS_HREF}
      label={withCount('Notifications', count)}
      icon={hostNavIcons.notifications}
      badge={count}
      current={current}
    />
  );
}

export type HostShellProps = {
  /** Null while the workspace is locked behind strong sign-in. */
  org: HostShellOrg | null;
  /** Unread notifications when the page was rendered. */
  initialNotifications?: number;
  children: ReactNode;
};

export function HostShell({ org, initialNotifications = 0, children }: HostShellProps) {
  const pathname = usePathname();
  // The unread count, kept live as in the seeker top bar (not while the workspace is locked).
  const { notifications } = useLiveCounts(org !== null, {
    inbox: 0,
    notifications: initialNotifications,
  });

  if (!org) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <SkipLink />
        <div className="border-b border-line bg-bg">
          <TopBar
            className="mx-auto w-full max-w-4xl md:pr-5 md:pl-8"
            brand={<Wordmark href="/host/security" />}
            actions={
              <div className="flex size-11 items-center justify-center">
                <UserButton />
              </div>
            }
          />
        </div>
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    );
  }

  const current = (href: string) => isHostCurrent(pathname, href);
  const notificationsCurrent = current(HOST_NOTIFICATIONS_HREF);
  const items: SidebarItem[] = HOST_NAV.map((item) => ({ ...item, current: current(item.href) }));
  const tabs: NavItem[] = [
    ...HOST_TAB_HREFS.flatMap((href) => {
      const item = HOST_NAV.find((i) => i.href === href);
      return item ? [{ ...item, current: current(href) }] : [];
    }),
    {
      href: HOST_MORE_HREF,
      label: 'More',
      icon: hostNavIcons.more,
      current: current(HOST_MORE_HREF) || HOST_MORE.some((item) => current(item.href)),
    },
  ];

  return (
    <div className="flex min-h-dvh bg-bg">
      <SkipLink />
      <Sidebar
        label="Host"
        className="sticky top-0 hidden h-dvh overflow-y-auto md:flex"
        header={
          <div className="flex flex-col gap-2">
            <Wordmark href="/host" className="px-2" />
            <HostOrgSwitcher org={org} />
          </div>
        }
        items={items}
        footer={
          <div className="flex min-h-11 items-center justify-between gap-2 border-t border-line px-1 pt-3">
            <UserButton showName />
            <NotificationsLink count={notifications} current={notificationsCurrent} />
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          className="sticky top-0 z-30 border-b border-line md:hidden"
          brand={<Wordmark href="/host" />}
          actions={
            <>
              <NotificationsLink count={notifications} current={notificationsCurrent} />
              <HostOrgSwitcher org={org} compact />
            </>
          }
        />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-16"
        >
          {children}
        </main>
        <BottomNav label="Host" items={tabs} className="fixed inset-x-0 bottom-0 z-30 md:hidden" />
      </div>
    </div>
  );
}
