import type { WalkthroughStep } from "./OnboardingWalkthrough";

/**
 * Default tour scripts. Copy is intentionally about WHERE things live and how
 * the nav works — no fabricated listings, counts, or names. Every href resolves
 * to a real route in the corresponding scope.
 *
 * Bump the storageKey version in the shells whenever these steps change enough
 * to be worth re-surfacing to people who already dismissed the tour.
 */

// HOST — three steps, shown prominently (auto-start). Post listings → the
// housing·meals·pay fields and their popups → applicants/invites/dashboard.
export const HOST_TOUR_STEPS: readonly WalkthroughStep[] = [
	{
		icon: "category.mix",
		title: "Post & manage your listings",
		body: "Everything you offer lives under Listings in the left rail. Hit “New listing” up top to publish a role — add a cover photo, the work, and where it is.",
		href: "/host/listings/new",
		hrefLabel: "Create a listing",
	},
	{
		icon: "benefit.housing",
		title: "Set housing, meals & pay",
		body: "In the listing editor you’ll set the three things seekers filter on most — housing, meals, and pay. Tap each field’s info popup for what counts and how it shows on your card.",
		href: "/host/listings",
		hrefLabel: "Open Listings",
	},
	{
		icon: "nav.seekers",
		title: "Review applicants & send invites",
		body: "Applications land under Applicants; use Invites to reach out directly. Your Overview dashboard tracks it all — views, applicants, and messages in one place.",
		href: "/host",
		hrefLabel: "Go to Overview",
	},
];

// SEEKER — three steps, shown subtly (launcher only, no auto-start). Find
// listings → read the benefits + popups → apply/invite/track in the dashboard.
export const SEEKER_TOUR_STEPS: readonly WalkthroughStep[] = [
	{
		icon: "nav.seek",
		title: "Find places to go",
		body: "Discover opportunities three ways: Seek to search and filter, Swipe to browse fast, and Map to explore by place. They’re on the bottom dock on mobile and the left rail on desktop.",
		href: "/seek",
		hrefLabel: "Start seeking",
	},
	{
		icon: "benefit.meals",
		title: "Read housing, meals & pay",
		body: "Each card shows the benefits that matter — housing, meals, and pay. Tap a benefit’s info popup on a listing to see exactly what’s included before you commit.",
		href: "/swipe",
		hrefLabel: "Browse listings",
	},
	{
		icon: "action.apply",
		title: "Apply, accept invites & track",
		body: "Apply from any listing, watch for host Invites, and follow every application in your Journey dashboard from applied through offered.",
		href: "/journey",
		hrefLabel: "Open your Journey",
	},
];
