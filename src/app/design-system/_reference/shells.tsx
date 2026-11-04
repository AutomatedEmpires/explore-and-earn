'use client';

// App chrome for the reference screens, built from the navigation components the way the
// seeker and host shells use them (foundation spec section 11): phones get a top bar and bottom
// tabs; desktop gets top links (seeker) or a sidebar (host).
import { useState } from 'react';
import {
  Avatar,
  BottomNav,
  IconButton,
  OrgSwitcher,
  Sidebar,
  TopBar,
  type NavItem,
  type SidebarItem,
} from '@/ui/components';
import { cn } from '@/ui/cn';
import { hostNavIcons as host, seekerNavIcons as seeker } from '@/ui/nav-icons';
import { hostOrgs, img } from '../_gallery/samples';

export type SeekerPlace = 'seek' | 'swipe' | 'map' | 'profile' | 'community' | null;

export function SeekerTopBar({ current, className }: { current: SeekerPlace; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl md:px-4', className)}>
      <TopBar
        role="seeker"
        links={[
          { href: '#seek', label: 'Seek', current: current === 'seek' },
          { href: '#swipe', label: 'Swipe', current: current === 'swipe' },
          { href: '#map', label: 'Map', current: current === 'map' },
          { href: '#community', label: 'Community', current: current === 'community' },
        ]}
        actions={
          <>
            <IconButton icon={seeker.community} label="Community" className="md:hidden" />
            <IconButton icon={seeker.inbox} label="Inbox, 2 unread" badge={2} />
            <IconButton icon={seeker.notifications} label="Notifications" />
            <button
              type="button"
              aria-label="Account menu"
              className="hidden size-11 items-center justify-center rounded-full hover:bg-surface-2 md:flex"
            >
              <Avatar name="Maya Rodriguez" src={img.maya} size="sm" decorative />
            </button>
          </>
        }
      />
    </div>
  );
}

export function SeekerBottomNav({ current }: { current: SeekerPlace }) {
  const items: NavItem[] = [
    { href: '#seek', label: 'Seek', icon: seeker.seek, current: current === 'seek' },
    { href: '#swipe', label: 'Swipe', icon: seeker.swipe, current: current === 'swipe' },
    { href: '#map', label: 'Map', icon: seeker.map, current: current === 'map' },
    { href: '#profile', label: 'Profile', icon: seeker.profile, current: current === 'profile' },
  ];
  return <BottomNav label="Main" items={items} className="sticky bottom-0 z-20 md:hidden" />;
}

export type HostPlace = 'home' | 'applicants' | 'messages' | 'listings';

function HostOrgSwitcher({ compact = false }: { compact?: boolean }) {
  const [current, setCurrent] = useState(hostOrgs[0]?.id ?? '');
  return (
    <OrgSwitcher orgs={hostOrgs} currentId={current} onSelect={setCurrent} compact={compact} />
  );
}

export function HostTopBar() {
  return (
    <TopBar
      role="host"
      className="md:hidden"
      actions={
        <>
          <IconButton icon={host.notifications} label="Notifications" />
          <HostOrgSwitcher compact />
        </>
      }
    />
  );
}

export function HostBottomNav({ current }: { current: HostPlace }) {
  const items: NavItem[] = [
    { href: '#home', label: 'Home', icon: host.home, current: current === 'home' },
    {
      href: '#applicants',
      label: 'Applicants',
      icon: host.applicants,
      current: current === 'applicants',
    },
    {
      href: '#messages',
      label: 'Messages',
      icon: host.messages,
      current: current === 'messages',
      attention: true,
    },
    { href: '#listings', label: 'Listings', icon: host.listings, current: current === 'listings' },
    { href: '#more', label: 'More', icon: host.more },
  ];
  return <BottomNav label="Host" items={items} className="sticky bottom-0 z-20 md:hidden" />;
}

/** Product spec section 15.2, in order. */
export function HostSidebar({ current }: { current: HostPlace }) {
  const items: SidebarItem[] = [
    { href: '#home', label: 'Home', icon: host.home, current: current === 'home' },
    { href: '#listings', label: 'Listings', icon: host.listings, current: current === 'listings' },
    {
      href: '#applicants',
      label: 'Applicants',
      icon: host.applicants,
      count: 8,
      current: current === 'applicants',
    },
    { href: '#candidates', label: 'Candidates', icon: host.candidates },
    { href: '#interviews', label: 'Interviews', icon: host.interviews },
    {
      href: '#messages',
      label: 'Messages',
      icon: host.messages,
      count: 3,
      current: current === 'messages',
    },
    { href: '#promote', label: 'Promote', icon: host.promote },
    { href: '#analytics', label: 'Analytics', icon: host.analytics },
    { href: '#host-page', label: 'Host page', icon: host.hostPage },
    { href: '#team', label: 'Team', icon: host.team },
    { href: '#billing', label: 'Billing', icon: host.billing },
    { href: '#settings', label: 'Settings', icon: host.settings },
  ];
  return (
    <Sidebar
      label="Host workspace"
      header={<HostOrgSwitcher />}
      items={items}
      className="sticky top-0 hidden h-dvh md:flex"
    />
  );
}
