/**
 * Dev Mock Bench — the surface index.
 *
 * A hand-maintained catalogue of reviewable surfaces grouped by lane, rendered
 * as a link launcher on /dev. Dynamic routes use a known fixture id so the link
 * resolves. Review tooling only.
 */

export interface DevSurface {
  readonly label: string;
  readonly href: string;
}

export interface DevSurfaceGroup {
  readonly lane: string;
  readonly surfaces: readonly DevSurface[];
}

export const DEV_SURFACES: readonly DevSurfaceGroup[] = [
  {
    lane: "Seeker",
    surfaces: [
      { label: "Discover (Seek)", href: "/seek" },
      { label: "Swipe deck", href: "/swipe" },
      { label: "Map", href: "/map" },
      { label: "Profile hub", href: "/profile" },
      { label: "Edit profile", href: "/profile/edit" },
      { label: "Resume", href: "/resume" },
      { label: "Saved", href: "/saved" },
      { label: "Applied", href: "/applied" },
      { label: "Accepted", href: "/accepted" },
      { label: "Offered", href: "/offered" },
      { label: "Not selected", href: "/not-selected" },
      { label: "Withdrawn", href: "/withdrawn" },
      { label: "Invites", href: "/invites" },
      { label: "Messages", href: "/messages" },
      { label: "Notifications", href: "/notifications" },
      { label: "Settings", href: "/settings" },
      { label: "Journey", href: "/journey" },
      { label: "Travel", href: "/travel" },
      { label: "Schedule", href: "/schedule" },
      { label: "Community", href: "/community" },
      { label: "Community · Photos", href: "/community/photos" },
      { label: "Community · Announcements", href: "/community/announcements" },
      { label: "Help", href: "/help" },
    ],
  },
  {
    lane: "Host",
    surfaces: [
      { label: "Dashboard", href: "/host/dashboard" },
      { label: "Listings", href: "/host/listings" },
      { label: "New listing", href: "/host/listings/new" },
      { label: "Applicants", href: "/host/applicants" },
      { label: "Messages", href: "/host/messages" },
      { label: "Analytics", href: "/host/analytics" },
      { label: "Profile", href: "/host/profile" },
      { label: "Edit profile", href: "/host/profile/edit" },
      { label: "Billing", href: "/host/billing" },
      { label: "Invites", href: "/host/invites" },
      { label: "Settings", href: "/host/settings" },
    ],
  },
  {
    lane: "Admin",
    surfaces: [
      { label: "Operations home", href: "/admin" },
      { label: "Listings", href: "/admin/listings" },
      { label: "Hosts", href: "/admin/hosts" },
      { label: "Applications", href: "/admin/applications" },
    ],
  },
  {
    lane: "Public & marketing",
    surfaces: [
      { label: "Home", href: "/" },
      { label: "Search", href: "/search" },
      { label: "Listing detail", href: "/listing/lst_orchard_wenatchee" },
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
  {
    lane: "Onboarding",
    surfaces: [
      { label: "Seeker onboarding", href: "/onboarding" },
      { label: "Seeker · Preferences", href: "/onboarding/prefs" },
      { label: "Seeker · Skills", href: "/onboarding/skills" },
      { label: "Seeker · Done", href: "/onboarding/done" },
      { label: "Host onboarding", href: "/host/onboarding" },
    ],
  },
];
