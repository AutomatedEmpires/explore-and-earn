import type { IconKey } from "@explore-and-earn/ui";

/**
 * The host rail's information architecture (D17, redesign V2).
 *
 * Lives in its own module — with no React in it — for two reasons. It is a
 * PRODUCT decision (which destinations exist, how they cluster, what order the
 * work happens in), so it deserves to be readable without wading through shell
 * markup; and it can then be asserted directly by a test instead of being
 * scraped out of a component's source.
 *
 * V3 shipped ten flat items plus a three-item footer, which gave "Billing" the
 * same visual rank as "Applicants" and buried the recruiting loop in a list.
 * The groups below say what a host is doing rather than what the route is:
 *
 *   Primary   the recruiting loop, in the order it actually happens
 *   Business  the company and the money
 *   Support   help getting it done
 *
 * TEAM IS DELIBERATELY ABSENT. D17 lists it under Business, but there is no
 * /host/team route: team membership is edited inside Settings, and D13 keeps
 * team seats out of every claim until the access exists. A rail entry is a
 * promise a destination is there — this one would be a promise we cannot keep.
 */

export interface HostNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** Matches its href EXACTLY, so child routes don't light the parent up. */
  readonly exact?: boolean;
  /** When set, the item shows the live unread-messages count as a badge. */
  readonly badgeKey?: "unread";
}

export interface HostNavGroup {
  readonly heading: string;
  readonly items: readonly HostNavItem[];
}

export const HOST_NAV_GROUPS: readonly HostNavGroup[] = [
  {
    heading: "Primary",
    items: [
      { href: "/host", label: "Overview", icon: "nav.dashboard", exact: true },
      { href: "/host/listings", label: "Listings", icon: "category.mix" },
      { href: "/host/applicants", label: "Applicants", icon: "nav.seekers" },
      // Renamed from "Invites" (D17). The SECTION is outbound recruiting;
      // "invite" stays the word for the unit, its lifecycle state, and the
      // metered credit that pays for one.
      { href: "/host/outreach", label: "Outreach", icon: "action.share" },
      {
        href: "/host/messages",
        label: "Messages",
        icon: "nav.messages",
        badgeKey: "unread",
      },
      {
        href: "/host/announcements",
        label: "Announcements",
        icon: "nav.announcements",
      },
      { href: "/host/analytics", label: "Analytics", icon: "analytics.trend" },
    ],
  },
  {
    heading: "Business",
    items: [
      { href: "/host/profile", label: "Employer profile", icon: "nav.profile" },
      { href: "/host/billing", label: "Billing", icon: "benefit.pay" },
    ],
  },
  {
    heading: "Support",
    items: [
      // Renamed from "Assistant" (D17): the seeker scope has an assistant of
      // its own, and "assistant" said nothing about what this one helps with.
      { href: "/host/coach", label: "Recruiting Coach", icon: "status.match" },
      { href: "/host/settings", label: "Settings", icon: "nav.settings" },
      { href: "/host/help", label: "Help", icon: "nav.help" },
    ],
  },
];
