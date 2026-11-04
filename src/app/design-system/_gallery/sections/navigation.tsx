'use client';

import { useState } from 'react';
import {
  Avatar,
  BottomNav,
  Button,
  IconButton,
  OrgSwitcher,
  Sidebar,
  TopBar,
  type NavItem,
  type SidebarItem,
} from '@/ui/components';
import {
  hostNavIcons as host,
  operatorNavIcons as operator,
  seekerNavIcons as seeker,
} from '@/ui/nav-icons';
import { hostOrgs, img } from '../samples';
import { ForceFocus, Section, Specimen } from '../Specimen';

const seekerTabs: NavItem[] = [
  { href: '#seek', label: 'Seek', icon: seeker.seek, current: true },
  { href: '#swipe', label: 'Swipe', icon: seeker.swipe },
  { href: '#map', label: 'Map', icon: seeker.map },
  { href: '#profile', label: 'Profile', icon: seeker.profile, attention: true },
];

const hostTabs: NavItem[] = [
  { href: '#home', label: 'Home', icon: host.home },
  { href: '#applicants', label: 'Applicants', icon: host.applicants, current: true },
  { href: '#messages', label: 'Messages', icon: host.messages, attention: true },
  { href: '#listings', label: 'Listings', icon: host.listings },
  { href: '#more', label: 'More', icon: host.more },
];

/** Product spec section 15.2, in order. */
export const hostSidebarItems: SidebarItem[] = [
  { href: '#home', label: 'Home', icon: host.home },
  {
    href: '#listings',
    label: 'Listings',
    icon: host.listings,
    children: [
      { href: '#listings-active', label: 'Active', current: true },
      { href: '#listings-drafts', label: 'Drafts' },
      { href: '#listings-library', label: 'Library' },
    ],
  },
  { href: '#applicants', label: 'Applicants', icon: host.applicants, count: 8 },
  { href: '#candidates', label: 'Candidates', icon: host.candidates },
  { href: '#interviews', label: 'Interviews', icon: host.interviews },
  { href: '#messages', label: 'Messages', icon: host.messages, count: 3 },
  { href: '#promote', label: 'Promote', icon: host.promote },
  { href: '#analytics', label: 'Analytics', icon: host.analytics },
  { href: '#host-page', label: 'Host page', icon: host.hostPage },
  { href: '#team', label: 'Team', icon: host.team },
  { href: '#billing', label: 'Billing', icon: host.billing },
  { href: '#settings', label: 'Settings', icon: host.settings },
];

/** Foundation spec section 11. */
const operatorSidebarItems: SidebarItem[] = [
  { href: '#console-home', label: 'Home', icon: operator.home, current: true },
  { href: '#queues', label: 'Review queues', icon: operator.queues, count: 4 },
  { href: '#users', label: 'Users & orgs', icon: operator.users },
  { href: '#audit', label: 'Audit log', icon: operator.audit },
  { href: '#operators', label: 'Operators', icon: operator.operators },
  { href: '#console-settings', label: 'Settings', icon: operator.settings },
];

function Switcher({ compact = false }: { compact?: boolean }) {
  const [current, setCurrent] = useState(hostOrgs[0]?.id ?? '');
  return (
    <OrgSwitcher
      orgs={hostOrgs}
      currentId={current}
      onSelect={setCurrent}
      onCreate={() => {}}
      compact={compact}
    />
  );
}

function SeekerActions() {
  return (
    <>
      <IconButton icon={seeker.community} label="Community" />
      <IconButton icon={seeker.inbox} label="Inbox, 2 unread" badge={2} />
      <IconButton icon={seeker.notifications} label="Notifications" />
    </>
  );
}

function AccountMenuButton() {
  return (
    <button
      type="button"
      aria-label="Account menu"
      className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
    >
      <Avatar name="Maya Rodriguez" src={img.maya} size="sm" decorative />
    </button>
  );
}

export function NavigationSection() {
  return (
    <>
      <Section
        id="top-bar"
        title="TopBar"
        description="The wordmark on the left; actions on the right as 44 px icon buttons with labels. On desktop the seeker bar adds Seek, Swipe, Map and Community. Which top bar the shells use is decided on the Top bar options page."
      >
        <Specimen title="Seeker, phone">
          {() => <TopBar actions={<SeekerActions />} className="max-w-sm" />}
        </Specimen>
        <Specimen title="Seeker, desktop" stack>
          {() => (
            <TopBar
              links={[
                { href: '#seek', label: 'Seek', current: true },
                { href: '#swipe', label: 'Swipe' },
                { href: '#map', label: 'Map' },
                { href: '#community', label: 'Community' },
              ]}
              actions={
                <>
                  <IconButton icon={seeker.inbox} label="Inbox, 2 unread" badge={2} />
                  <IconButton icon={seeker.notifications} label="Notifications" />
                  <AccountMenuButton />
                </>
              }
            />
          )}
        </Specimen>
        <Specimen
          title="Signed out"
          note="Visitors see Sign in instead of Inbox and Notifications."
        >
          {() => (
            <TopBar
              className="max-w-sm"
              actions={
                <Button variant="secondary" className="mr-2">
                  Sign in
                </Button>
              }
            />
          )}
        </Specimen>
        <Specimen title="Host, phone">
          {() => (
            <TopBar
              role="host"
              className="max-w-sm"
              actions={
                <>
                  <IconButton icon={host.notifications} label="Notifications" />
                  <Switcher compact />
                </>
              }
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="bottom-nav"
        title="BottomNav"
        description="Phone tabs, pinned. The current tab is marked aria-current and gets a tinted pill; a dot that needs attention is also announced."
      >
        <Specimen title="Seeker" note="Seek · Swipe · Map · Profile.">
          {() => <BottomNav label="Main" items={seekerTabs} className="max-w-sm" />}
        </Specimen>
        <Specimen title="Host" note="Home · Applicants · Messages · Listings · More.">
          {() => <BottomNav label="Host" items={hostTabs} className="max-w-sm" />}
        </Specimen>
        <Specimen title="Focus">
          {() => (
            <ForceFocus current>
              <BottomNav label="Main" items={seekerTabs} className="max-w-sm" />
            </ForceFocus>
          )}
        </Specimen>
      </Section>

      <Section
        id="sidebar"
        title="Sidebar"
        description="Desktop navigation for the host workspace and the operator console. Counts are part of each link’s text; sub-pages show while their section is open."
      >
        <Specimen
          title="Host workspace"
          note="The order from product spec section 15.2, with the organization switcher on top."
        >
          {() => (
            <Sidebar
              label="Host workspace"
              header={<Switcher />}
              items={hostSidebarItems}
              className="rounded-lg border"
            />
          )}
        </Specimen>
        <Specimen title="Operator console">
          {() => (
            <Sidebar
              label="Operator console"
              items={operatorSidebarItems}
              className="rounded-lg border"
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="org-switcher"
        title="OrgSwitcher"
        description="Switches between a host’s organizations. Compact (the logo alone) in the phone top bar."
      >
        <Specimen title="States">
          {() => (
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex w-64 flex-col gap-2">
                <span className="text-12 font-semibold text-muted">Default</span>
                <Switcher />
              </div>
              <div className="flex w-64 flex-col gap-2">
                <span className="text-12 font-semibold text-muted">Focus</span>
                <ForceFocus>
                  <Switcher />
                </ForceFocus>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-12 font-semibold text-muted">Compact</span>
                <Switcher compact />
              </div>
            </div>
          )}
        </Specimen>
      </Section>
    </>
  );
}
