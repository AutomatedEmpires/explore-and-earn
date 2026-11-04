// One icon per navigation destination. The seeker and host shells, the operator console, the
// design system's navigation specimens, reference screens and top bar options all take their
// icons from here, so the screens the founder approves show the icons the app ships
// (src/app/design-system/_reference/shells.test.tsx).
import {
  Bell,
  Briefcase,
  CalendarDays,
  ChartColumn,
  Compass,
  CreditCard,
  GalleryHorizontal,
  House,
  Inbox,
  ListChecks,
  Map as MapIcon,
  Megaphone,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Store,
  User,
  Users,
  type IconComponent,
} from './icons';

/** Product spec section 15.1: the bottom tabs, then the top bar. */
export const seekerNavIcons = {
  seek: Compass,
  swipe: GalleryHorizontal,
  map: MapIcon,
  profile: User,
  community: Users,
  /** Messages, job invites and interview invites. */
  inbox: MessageSquare,
  notifications: Bell,
  settings: Settings,
} as const satisfies Record<string, IconComponent>;

/** Product spec section 15.2: the sidebar in order, then the phone's extras. */
export const hostNavIcons = {
  home: House,
  listings: Briefcase,
  applicants: Inbox,
  candidates: Search,
  interviews: CalendarDays,
  messages: MessageSquare,
  promote: Megaphone,
  analytics: ChartColumn,
  hostPage: Store,
  team: Users,
  billing: CreditCard,
  settings: Settings,
  security: ShieldCheck,
  notifications: Bell,
  /** The last phone tab: everything the other tabs leave out. */
  more: Menu,
} as const satisfies Record<string, IconComponent>;

/** Foundation spec section 11: the operator console's sidebar. */
export const operatorNavIcons = {
  home: House,
  queues: ListChecks,
  users: Users,
  audit: ShieldCheck,
  operators: User,
  settings: Settings,
} as const satisfies Record<string, IconComponent>;
