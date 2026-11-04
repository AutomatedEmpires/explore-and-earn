// The host workspace's navigation (product spec section 15.2), shared by the shell and the
// phone "More" page.
import type { IconComponent } from '@/ui/icons';
import { hostNavIcons as icons } from '@/ui/nav-icons';

export type HostNavItem = { href: string; label: string; icon: IconComponent };

/** The desktop sidebar, in the spec's order (the organization switcher sits above it). */
export const HOST_NAV: readonly HostNavItem[] = [
  { href: '/host', label: 'Home', icon: icons.home },
  { href: '/host/listings', label: 'Listings', icon: icons.listings },
  { href: '/host/applicants', label: 'Applicants', icon: icons.applicants },
  { href: '/host/candidates', label: 'Candidates', icon: icons.candidates },
  { href: '/host/interviews', label: 'Interviews', icon: icons.interviews },
  { href: '/host/messages', label: 'Messages', icon: icons.messages },
  { href: '/host/promote', label: 'Promote', icon: icons.promote },
  { href: '/host/analytics', label: 'Analytics', icon: icons.analytics },
  { href: '/host/host-page', label: 'Host page', icon: icons.hostPage },
  { href: '/host/team', label: 'Team', icon: icons.team },
  { href: '/host/billing', label: 'Billing', icon: icons.billing },
  { href: '/host/settings', label: 'Settings', icon: icons.settings },
];

/** Phone bottom tabs before "More": Home, Applicants, Messages, Listings. */
export const HOST_TAB_HREFS = ['/host', '/host/applicants', '/host/messages', '/host/listings'];

export const HOST_MORE_HREF = '/host/more';

/** In the phone top bar and the desktop sidebar's footer, beside the account. */
export const HOST_NOTIFICATIONS_HREF = '/host/notifications';

const SECURITY: HostNavItem = { href: '/host/security', label: 'Security', icon: icons.security };

/** Everything the bottom tabs leave out, listed on the phone "More" page. */
export const HOST_MORE: readonly HostNavItem[] = [
  ...HOST_NAV.filter((item) => !HOST_TAB_HREFS.includes(item.href)),
  SECURITY,
];

export function isHostCurrent(pathname: string, href: string): boolean {
  if (href === '/host') return pathname === '/host';
  return pathname === href || pathname.startsWith(`${href}/`);
}
