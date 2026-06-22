import type { IconKey } from "@explore-and-earn/ui";

export type NotificationKind =
	| "invite_received"
	| "invite_expiring"
	| "matched_listing"
	| "offer_received"
	| "application_status"
	| "saved_reminder"
	| "interview"
	| "travel_reminder"
	| "community_reaction"
	| "check_in"
	| "review_prompt"
	| "next_adventure";

export interface NotificationItem {
	readonly id: string;
	readonly kind: NotificationKind;
	readonly icon: IconKey;
	readonly title: string;
	readonly detail: string;
	readonly timeAgo: string;
	readonly unread: boolean;
}

export const NOTIFICATIONS: readonly NotificationItem[] = [
	{
		id: "ntf_offer",
		kind: "offer_received",
		icon: "status.match",
		title: "Offer received",
		detail: "Cascade Bloom Orchards sent you an offer.",
		timeAgo: "1h",
		unread: true,
	},
	{
		id: "ntf_invite_expiring",
		kind: "invite_expiring",
		icon: "system.warning",
		title: "Invite expiring soon",
		detail: "Your invite from North Pacific Fisheries expires soon.",
		timeAgo: "3h",
		unread: true,
	},
	{
		id: "ntf_match",
		kind: "matched_listing",
		icon: "status.match",
		title: "New matched listing",
		detail: "Remote Community Manager looks like a strong fit.",
		timeAgo: "5h",
		unread: true,
	},
	{
		id: "ntf_status",
		kind: "application_status",
		icon: "action.apply",
		title: "Application update",
		detail: "Orchard Harvest Hand moved to Reviewing.",
		timeAgo: "1d",
		unread: true,
	},
	{
		id: "ntf_saved",
		kind: "saved_reminder",
		icon: "nav.saved",
		title: "Saved listing closing soon",
		detail: "Eco-Hostel Allrounder is closing soon.",
		timeAgo: "2d",
		unread: false,
	},
	{
		id: "ntf_community",
		kind: "community_reaction",
		icon: "system.success",
		title: "New reaction",
		detail: "Your trail photo received 5 reactions.",
		timeAgo: "3d",
		unread: false,
	},
];

export interface SettingRow {
	readonly id: string;
	readonly icon: IconKey;
	readonly label: string;
	readonly value: string;
}

export interface SettingGroup {
	readonly id: string;
	readonly title: string;
	readonly rows: readonly SettingRow[];
}

export const SETTINGS_GROUPS: readonly SettingGroup[] = [
	{
		id: "account",
		title: "Account",
		rows: [
			{ id: "email", icon: "nav.profile", label: "Email", value: "riley@example.com" },
			{ id: "scope", icon: "system.info", label: "Active scope", value: "Seeker" },
			{ id: "security", icon: "system.lock", label: "Password and security", value: "Manage" },
		],
	},
	{
		id: "notifications",
		title: "Notification preferences",
		rows: [
			{ id: "invites", icon: "action.message", label: "Invites and offers", value: "On" },
			{ id: "matches", icon: "status.match", label: "Matched listings", value: "On" },
			{ id: "reminders", icon: "system.info", label: "Reminders and check-ins", value: "On" },
		],
	},
	{
		id: "privacy",
		title: "Privacy and sharing",
		rows: [
			{ id: "visibility", icon: "nav.profile", label: "Profile visibility", value: "Hosts I apply to" },
			{ id: "contact", icon: "action.message", label: "Contact visibility", value: "After offer" },
			{ id: "community", icon: "system.success", label: "Community activity", value: "On" },
		],
	},
	{
		id: "controls",
		title: "Account controls",
		rows: [
			{ id: "deactivate", icon: "system.warning", label: "Deactivate account", value: "Manage" },
		],
	},
];

export interface HelpItem {
	readonly id: string;
	readonly icon: IconKey;
	readonly title: string;
	readonly detail: string;
	/** Destination — internal route or mailto. Every help item is a real link. */
	readonly href: string;
}

export const HELP_ITEMS: readonly HelpItem[] = [
	{ id: "articles", icon: "system.info", title: "Help articles", detail: "Guides on profiles, applying, and offers.", href: "/faq" },
	{ id: "application", icon: "action.apply", title: "Application help", detail: "Resume gates, applying, and tracking status.", href: "/faq" },
	{ id: "safety", icon: "trust.verified_host", title: "Safety and trust", detail: "How verification and Self-Declared by Host works.", href: "/about" },
	{ id: "report", icon: "system.warning", title: "Report an issue", detail: "Report a listing, host, message, or photo.", href: "mailto:jackson@automatedempires.com?subject=Report%20an%20issue" },
	{ id: "account", icon: "system.lock", title: "Account help", detail: "Sign-in, security, and account controls.", href: "/settings" },
	{ id: "contact", icon: "action.message", title: "Contact support", detail: "Reach the Explore&Earn team.", href: "mailto:jackson@automatedempires.com?subject=Support" },
];
