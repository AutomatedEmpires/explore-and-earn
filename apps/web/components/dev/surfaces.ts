/**
 * Dev Mock Bench — the surface index.
 *
 * A hand-maintained catalogue of reviewable surfaces grouped by lane, rendered
 * as a link launcher on /dev. Dynamic routes use a known fixture id so the link
 * resolves. Review tooling only.
 *
 * Href discipline (review 2026-07-22): every href must match a real route
 * directory. Route GROUPS add no URL segment — the admin moderation pages live
 * at TOP-LEVEL paths (/listings, /hosts, /applications), NOT under /admin; the
 * host dashboard is /host itself (there is no /host/dashboard).
 */

import { DEMO_SURFACES } from "../demo/enterpriseDemo";

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
    lane: "Review tools",
    surfaces: [{ label: "Component catalog", href: "/dev/catalog" }],
  },
  {
    lane: "Seeker",
    surfaces: [
      { label: "Home dashboard", href: "/home" },
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
      { label: "Badges", href: "/badges" },
      { label: "Assistant", href: "/assistant" },
      { label: "Community", href: "/community" },
      { label: "Community · Photos", href: "/community/photos" },
      { label: "Community · Announcements", href: "/community/announcements" },
      { label: "Help", href: "/help" },
    ],
  },
  {
    lane: "Host",
    surfaces: [
      { label: "Dashboard", href: "/host" },
      { label: "Listings", href: "/host/listings" },
      { label: "New listing", href: "/host/listings/new" },
      { label: "Applicants", href: "/host/applicants" },
      { label: "Messages", href: "/host/messages" },
      { label: "Analytics", href: "/host/analytics" },
      { label: "Announcements", href: "/host/announcements" },
      { label: "Recruiting Coach", href: "/host/coach" },
      { label: "Profile", href: "/host/profile" },
      { label: "Edit profile", href: "/host/profile/edit" },
      { label: "Billing", href: "/host/billing" },
      { label: "Plans", href: "/host/plans" },
      { label: "Outreach", href: "/host/outreach" },
      { label: "Settings", href: "/host/settings" },
      { label: "Help", href: "/host/help" },
    ],
  },
  {
    lane: "Admin",
    surfaces: [
      { label: "Operations home", href: "/admin" },
      { label: "Listings moderation", href: "/listings" },
      { label: "Hosts moderation", href: "/hosts" },
      { label: "Applications queue", href: "/applications" },
      { label: "Claims", href: "/admin/claims" },
      { label: "Refunds", href: "/admin/refunds" },
      { label: "Reports", href: "/admin/reports" },
      { label: "Notifications ops", href: "/admin/notifications" },
      { label: "Email preview", href: "/admin/email-preview" },
      { label: "Guidelines", href: "/admin/guidelines" },
      { label: "Photo buckets", href: "/admin/photo-buckets" },
    ],
  },
  {
    lane: "Public & marketing",
    surfaces: [
      { label: "Home", href: "/" },
      { label: "Search", href: "/search" },
      { label: "Jobs hub", href: "/jobs" },
      { label: "Jobs · Farm", href: "/jobs/farm" },
      { label: "Jobs · Maritime", href: "/jobs/maritime" },
      { label: "Jobs · Remote", href: "/jobs/remote" },
      { label: "Jobs · Seasonal", href: "/jobs/seasonal" },
      { label: "Listing detail", href: "/listing/lst_orchard_wenatchee" },
      {
        label: "Sourced listing · unknown fields",
        href: "/listing/lst_sourced_kelp_farm",
      },
      { label: "For seekers", href: "/for-seekers" },
      { label: "For hosts", href: "/for-hosts" },
      { label: "Blog", href: "/blog" },
      {
        label: "Blog · Housing included",
        href: "/blog/what-housing-included-actually-means",
      },
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
      { label: "Refunds", href: "/refunds" },
      { label: "Photo credits", href: "/credits" },
      { label: "Sourced listings", href: "/sourced-listings" },
    ],
  },
  {
    lane: "Enterprise demo · sample data",
    surfaces: DEMO_SURFACES.map(({ label, href }) => ({ label, href })),
  },
  {
    lane: "Auth & handoffs",
    surfaces: [
      { label: "Sign in · Seeker", href: "/sign-in?role=seeker" },
      { label: "Sign in · Host", href: "/sign-in?role=host" },
      { label: "Sign in · Admin", href: "/sign-in?role=admin" },
      { label: "Sign up · Seeker", href: "/sign-up?role=seeker" },
      { label: "Sign up · Host", href: "/sign-up?role=host" },
      {
        label: "Team invite · Missing code",
        href: "/team/accept",
      },
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
