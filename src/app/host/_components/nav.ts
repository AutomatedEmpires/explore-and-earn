// The host workspace's navigation (product spec section 15.2), shared by the shell and the
// phone "More" page.
import {
  Bookmark,
  Briefcase,
  CalendarDays,
  ChartColumn,
  CreditCard,
  House,
  Inbox,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  Store,
  Users,
  type IconComponent,
} from '@/ui/icons';

export type HostNavItem = { href: string; label: string; icon: IconComponent };

/** The desktop sidebar, in the spec's order (the organization switcher sits above it). */
export const HOST_NAV: readonly HostNavItem[] = [
  { href: '/host', label: 'Home', icon: House },
  { href: '/host/listings', label: 'Listings', icon: Briefcase },
  { href: '/host/applicants', label: 'Applicants', icon: Inbox },
  { href: '/host/candidates', label: 'Candidates', icon: Bookmark },
  { href: '/host/interviews', label: 'Interviews', icon: CalendarDays },
  { href: '/host/messages', label: 'Messages', icon: MessageSquare },
  { href: '/host/promote', label: 'Promote', icon: Megaphone },
  { href: '/host/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/host/host-page', label: 'Host page', icon: Store },
  { href: '/host/team', label: 'Team', icon: Users },
  { href: '/host/billing', label: 'Billing', icon: CreditCard },
  { href: '/host/settings', label: 'Settings', icon: Settings },
];

/** Phone bottom tabs before "More": Home, Applicants, Messages, Listings. */
export const HOST_TAB_HREFS = ['/host', '/host/applicants', '/host/messages', '/host/listings'];

export const HOST_MORE_HREF = '/host/more';

const SECURITY: HostNavItem = { href: '/host/security', label: 'Security', icon: ShieldCheck };

/** Everything the bottom tabs leave out, listed on the phone "More" page. */
export const HOST_MORE: readonly HostNavItem[] = [
  ...HOST_NAV.filter((item) => !HOST_TAB_HREFS.includes(item.href)),
  SECURITY,
];

export function isHostCurrent(pathname: string, href: string): boolean {
  if (href === '/host') return pathname === '/host';
  return pathname === href || pathname.startsWith(`${href}/`);
}
