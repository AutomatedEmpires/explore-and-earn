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
	/** Normalized same-origin destination; null keeps the notification inert. */
	readonly actionHref: string | null;
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
		actionHref: null,
	},
	{
		id: "ntf_invite_expiring",
		kind: "invite_expiring",
		icon: "system.warning",
		title: "Invite expiring soon",
		detail: "Your invite from North Pacific Fisheries expires soon.",
		timeAgo: "3h",
		unread: true,
		actionHref: null,
	},
	{
		id: "ntf_match",
		kind: "matched_listing",
		icon: "status.match",
		title: "New matched listing",
		detail: "Remote Community Manager looks like a strong fit.",
		timeAgo: "5h",
		unread: true,
		actionHref: null,
	},
	{
		id: "ntf_status",
		kind: "application_status",
		icon: "action.apply",
		title: "Application update",
		detail: "Orchard Harvest Hand moved to Reviewing.",
		timeAgo: "1d",
		unread: true,
		actionHref: null,
	},
	{
		id: "ntf_saved",
		kind: "saved_reminder",
		icon: "nav.saved",
		title: "Saved listing closing soon",
		detail: "Eco-Hostel Allrounder is closing soon.",
		timeAgo: "2d",
		unread: false,
		actionHref: null,
	},
	{
		id: "ntf_community",
		kind: "community_reaction",
		icon: "system.success",
		title: "New reaction",
		detail: "Your trail photo received 5 reactions.",
		timeAgo: "3d",
		unread: false,
		actionHref: null,
	},
];

export interface SettingRow {
	readonly id: string;
	readonly icon: IconKey;
	readonly label: string;
	readonly value: string;
	/** Optional destination — when set the row is a real link (route or mailto). */
	readonly href?: string;
	/** Visually flags a destructive/attention row (e.g. deactivate). */
	readonly tone?: "default" | "warning";
}

export interface SettingGroup {
	readonly id: string;
	readonly title: string;
	/** Optional one-line context under the group title. */
	readonly description?: string;
	readonly rows: readonly SettingRow[];
}

/**
 * Read-only account/privacy groups for the seeker settings view. Notification
 * preferences are NOT included here — those are the live, writable toggles in
 * `NotificationPrefsForm`. Email is injected at render time from the signed-in
 * user (never a raw Clerk id); pass `email` to `buildAccountGroups`.
 */
export function buildAccountGroups(email: string | null): readonly SettingGroup[] {
	return [
		{
			id: "account",
			title: "Account",
			rows: [
				{
					id: "email",
					icon: "nav.profile",
					label: "Email",
					value: email ?? "Not signed in",
				},
				{ id: "scope", icon: "system.info", label: "Active scope", value: "Seeker" },
				{
					id: "security",
					icon: "system.lock",
					label: "Password and security",
					value: "Manage",
					href: "mailto:jackson@automatedempires.com?subject=Account%20security",
				},
			],
		},
		{
			id: "privacy",
			title: "Privacy and sharing",
			description: "Who can see your profile and contact details.",
			rows: [
				{ id: "contact", icon: "action.message", label: "Contact visibility", value: "After offer" },
				{ id: "community", icon: "system.success", label: "Community activity", value: "On" },
			],
		},
		{
			id: "controls",
			title: "Account controls",
			rows: [
				{
					id: "deactivate",
					icon: "system.warning",
					label: "Deactivate account",
					value: "Manage",
					tone: "warning",
					href: "mailto:jackson@automatedempires.com?subject=Deactivate%20my%20account",
				},
			],
		},
	];
}

/** Static groups for non-personalized previews/tests. */
export const SETTINGS_GROUPS: readonly SettingGroup[] = buildAccountGroups(null);

export interface SettingsAssurance {
	readonly id: string;
	readonly icon: IconKey;
	readonly title: string;
	readonly detail: string;
}

/** Trust / "what to expect" reassurances shown on the settings surface. */
export const SETTINGS_ASSURANCES: readonly SettingsAssurance[] = [
	{
		id: "free",
		icon: "benefit.pay",
		title: "Seekers are free, forever",
		detail: "No fees to browse, apply, or accept work. We never take a cut of your pay.",
	},
	{
		id: "private",
		icon: "system.lock",
		title: "Your details stay yours",
		detail: "Hosts only see your contact info once you choose to engage with them.",
	},
	{
		id: "report",
		icon: "trust.verified_host",
		title: "Report anything that feels off",
		detail: "Listings, hosts, and messages can be reported confidentially, any time.",
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
	{ id: "safety", icon: "trust.verified_host", title: "Safety and trust", detail: "What the Verified Host badge means, and how to stay safe.", href: "/about" },
	{ id: "report", icon: "system.warning", title: "Report an issue", detail: "Report a listing, host, message, or photo.", href: "mailto:jackson@automatedempires.com?subject=Report%20an%20issue" },
	{ id: "account", icon: "system.lock", title: "Account help", detail: "Sign-in, security, and account controls.", href: "/settings" },
	{ id: "contact", icon: "action.message", title: "Contact support", detail: "Reach the Explore&Earn team.", href: "mailto:jackson@automatedempires.com?subject=Support" },
];

/** A help/FAQ topic category. Icons mirror the registry. */
export type HelpTopicId =
	| "getting-started"
	| "applying"
	| "housing-meals-pay"
	| "safety"
	| "account";

export interface HelpTopic {
	readonly id: HelpTopicId;
	readonly icon: IconKey;
	readonly label: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
	{ id: "getting-started", icon: "nav.seek", label: "Getting started" },
	{ id: "applying", icon: "action.apply", label: "Applying" },
	{ id: "housing-meals-pay", icon: "benefit.housing", label: "Housing, meals & pay" },
	{ id: "safety", icon: "trust.verified_host", label: "Safety & trust" },
	{ id: "account", icon: "system.lock", label: "Account & access" },
];

export interface HelpFaq {
	readonly id: string;
	readonly topic: HelpTopicId;
	readonly question: string;
	/** Plain-text answer paragraphs. No markup — rendered as <p> per item. */
	readonly answer: readonly string[];
	/** Optional deep link to a real route for "read more". */
	readonly href?: string;
	readonly hrefLabel?: string;
}

/**
 * Seeker FAQ canon. Editorial copy only — no DB-backed claims. Every `href`
 * points at a route that exists in the app; never invent destinations.
 */
export const HELP_FAQS: readonly HelpFaq[] = [
	{
		id: "free-forever",
		topic: "getting-started",
		question: "Is Explore&Earn really free for seekers?",
		answer: [
			"Yes. Seekers are free forever. Browsing, saving, applying, messaging hosts, and accepting offers never cost you anything.",
			"We make our money from the hosts who list opportunities, never from the people doing the exploring. There is no premium seeker tier, no paywalled applications, and no fee taken out of your pay.",
		],
	},
	{
		id: "what-is",
		topic: "getting-started",
		question: "What kind of work is on Explore&Earn?",
		answer: [
			"Real-world, place-based work: farms, maritime and coastal crews, seasonal lodges and hospitality, and remote roles you can do from a basecamp.",
			"Every opportunity tells you three things up front — where you'll sleep, what you'll eat, and what you'll earn — so you can compare honestly before you apply.",
		],
		href: "/seek",
		hrefLabel: "Browse opportunities",
	},
	{
		id: "build-profile",
		topic: "getting-started",
		question: "How do I get ready to apply?",
		answer: [
			"Build out your profile and resume, then set your readiness so hosts know when you can start. A complete profile and a clear resume make your applications far stronger.",
			"Some listings have a resume gate — they ask you to have a resume on file before you can apply. You can build yours in a few minutes.",
		],
		href: "/resume",
		hrefLabel: "Build your resume",
	},
	{
		id: "how-apply",
		topic: "applying",
		question: "How does applying work?",
		answer: [
			"Open any opportunity and tap Apply. If the host has a resume gate, you'll be asked to add a resume first. Once you apply, the host can review your profile and respond.",
			"You can track every application from Applied — see what's in review, what moved to an offer, and what's been declined.",
		],
		href: "/applied",
		hrefLabel: "View your applications",
	},
	{
		id: "track-status",
		topic: "applying",
		question: "What do the application statuses mean?",
		answer: [
			"Applied means the host has your application. Reviewing means they're looking at it. Offered means they've made you an offer to respond to. Accepted means you said yes. Declined or Not selected means it didn't move forward this time — which is normal, and not a reflection of your worth.",
			"Invites work the other way around: a host reaches out to you first. You'll find those under Invites.",
		],
		href: "/invites",
		hrefLabel: "See your invites",
	},
	{
		id: "withdraw",
		topic: "applying",
		question: "Can I withdraw an application?",
		answer: [
			"Yes. Open the application from Applied and choose Withdraw. It's courteous to withdraw if your plans change so the host isn't holding a spot for you.",
		],
		href: "/applied",
		hrefLabel: "Manage applications",
	},
	{
		id: "housing",
		topic: "housing-meals-pay",
		question: "Where will I sleep?",
		answer: [
			"Every listing states its housing up front — on-site bunkhouse, a private room, a shared cabin, a campsite, or a stipend toward your own place. The Housing line tells you what's provided and whether it's free, subsidised, or paid.",
			"If anything about housing is unclear, message the host before you accept. Knowing exactly where you'll sleep is part of the deal here.",
		],
	},
	{
		id: "meals",
		topic: "housing-meals-pay",
		question: "What will I eat?",
		answer: [
			"The Meals line on each listing tells you what's covered — full board, some meals, a kitchen to cook in, or a meal stipend. We never hide this behind a vague 'perks' label.",
		],
	},
	{
		id: "pay",
		topic: "housing-meals-pay",
		question: "What will I earn, and how do I get paid?",
		answer: [
			"Pay is shown up front on every listing — an hourly rate, a daily rate, a stipend, or a seasonal total, along with how often it's paid.",
			"Pay arrangements are between you and the host. Explore&Earn doesn't take a cut of your earnings. Confirm the details in writing with the host before you start.",
		],
	},
	{
		id: "verified-host",
		topic: "safety",
		question: "What does the Verified Host badge mean?",
		answer: [
			"A Verified Host badge means the host is on an active paid plan with Explore&Earn — it shows they've invested in the platform, not that we've independently confirmed their identity, property, or claims.",
			"Listing details like housing and meals descriptions are stated by the host. Always research a host and message them with questions before you travel — treat every listing as a starting point, and trust your judgement.",
		],
		href: "/about",
		hrefLabel: "How verification works",
	},
	{
		id: "stay-safe",
		topic: "safety",
		question: "How do I stay safe when arranging work?",
		answer: [
			"Keep your conversations on Explore&Earn until you've agreed to work together. Get the key terms — housing, meals, pay, start and end dates — confirmed in writing.",
			"Never send money to secure a placement; legitimate hosts don't charge you to work. Share your travel plans with someone you trust, and have a way to leave if a situation doesn't feel right.",
		],
	},
	{
		id: "report-block",
		topic: "safety",
		question: "How do I report a host, listing, or message?",
		answer: [
			"If something feels off — a misleading listing, a pushy message, or anything unsafe — report it and we'll review it. You can report a listing, host, message, or photo.",
			"Reporting is confidential. When in doubt, report it; we'd rather take a look than have you stay quiet.",
		],
		href: "mailto:jackson@automatedempires.com?subject=Report%20an%20issue",
		hrefLabel: "Report an issue",
	},
	{
		id: "sign-in",
		topic: "account",
		question: "I'm having trouble signing in.",
		answer: [
			"Most sign-in issues clear up by signing out and back in. If you're still stuck, contact support and we'll help you regain access.",
		],
		href: "mailto:jackson@automatedempires.com?subject=Sign-in%20help",
		hrefLabel: "Contact support",
	},
	{
		id: "notifications",
		topic: "account",
		question: "How do I change my notifications and privacy?",
		answer: [
			"Open Settings to choose which emails you get — invites and offers, status changes, and messages — and to manage your privacy and account controls.",
		],
		href: "/settings",
		hrefLabel: "Open settings",
	},
	{
		id: "delete",
		topic: "account",
		question: "Can I deactivate my account?",
		answer: [
			"Yes. You can deactivate your account from Settings under Account controls. If you'd like help, contact support.",
		],
		href: "/settings",
		hrefLabel: "Open settings",
	},
];
