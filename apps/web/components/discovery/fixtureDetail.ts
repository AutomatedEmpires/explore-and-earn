import type {
	EffectiveHousingPhoto,
	OpportunityCategory,
} from "@explore-and-earn/contracts";
import type { PublicListingDetail } from "@explore-and-earn/db";

import type { DiscoveryListing } from "./listing";
import { DISCOVERY_FIXTURES } from "./fixtures";

/**
 * Resolve a fixture id (lst_*) to the public listing-detail shape so the
 * dev/preview discover → inspect journey works end-to-end on fixture
 * inventory instead of dead-ending at the route error boundary.
 *
 * NEVER serves production traffic: fixture ids are non-UUIDs, which cannot
 * exist in the DB, and the NODE_ENV gate below refuses them in production
 * outright — an unknown id there is an honest 404.
 */
export function getFixtureListingDetail(id: string): PublicListingDetail | null {
	if (process.env.NODE_ENV === "production") return null;
	const fixture = DISCOVERY_FIXTURES.find((listing) => listing.id === id);
	return fixture ? toDetail(fixture) : null;
}

function toIso(display: string | undefined): string | null {
	if (!display) return null;
	const parsed = Date.parse(display);
	return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * DEV/PREVIEW-ONLY listing media.
 *
 * There is none, and that is deliberate. The sample gallery and the housing /
 * meals evidence photos were built from a curated stock library delivered by an
 * image CDN this product no longer uses. We hold no replacement imagery, and a
 * fixture URL pointing at an object that does not exist is a fabricated URL —
 * so the dev bench now renders exactly what a listing with no uploaded media
 * looks like: the category watermark on the card, and the honest "no photos
 * yet" state on the detail page. That is the same state a real host sees before
 * they upload, so the preview journey is MORE representative, not less.
 *
 * Host-uploaded listing media is unaffected — it lives in Supabase Storage and
 * flows through `coverPhotoUrl` / `housingPhotos` from the DB as it always has.
 * Seeded sample media returns here when the `site-photos` bucket is populated
 * (scripts/seed-site-photos.mjs; docs/design/site-photos.md).
 */
const GALLERY_PHOTO_URLS: readonly string[] = [];

const HOUSING_PHOTOS_BY_LISTING: Readonly<
	Partial<Record<string, readonly EffectiveHousingPhoto[]>>
> = {};

/** Immersive-detail sample content for the dev fixtures, by category. */
interface DetailEnrichment {
	responsibilities: string[];
	requirements: string[];
	perks: string[];
	housingDescription: string;
	mealsDescription: string;
	activities: string[];
	team: { name: string; role: string; photoUrl: null }[];
	whyWorkForUs: string;
	hostPerks: string[];
}

/**
 * DEV/PREVIEW-ONLY narrative so the immersive listing page renders every
 * section on fixture inventory. Thematic per category; grounded, never shown in
 * production (the NODE_ENV gate above refuses fixture ids there). Team members
 * carry photoUrl: null on purpose (framed placeholder avatars — no remote-image
 * host allow-listing needed).
 */
const DETAIL_ENRICHMENT_BY_CATEGORY: Record<OpportunityCategory, DetailEnrichment> = {
	farm: {
		responsibilities: [
			"Hand-pick and sort fruit at peak ripeness",
			"Load and stage harvest bins for transport",
			"Keep tools, ladders, and the packing area clean and safe",
			"Support irrigation and pruning between picks",
		],
		requirements: [
			"Comfortable on your feet outdoors for full shifts",
			"Able to lift up to 40 lbs repeatedly",
			"Reliable, punctual, and team-minded",
			"No experience needed — we train on arrival",
		],
		perks: [
			"Fresh produce to take home",
			"Flexible day-off scheduling",
			"End-of-harvest completion bonus",
		],
		housingDescription:
			"Shared bunkhouse a short walk from the orchard — bed linens and a shared kitchen provided.",
		mealsDescription:
			"Hot lunch on every shift; the kitchen is stocked for your own breakfasts and dinners.",
		activities: [
			"Valley cycling routes",
			"Weekend farmers markets",
			"River swimming spots",
			"Evening bonfires with the crew",
		],
		team: [
			{ name: "Dana Whitfield", role: "Orchard Manager", photoUrl: null },
			{ name: "Marco Reyes", role: "Harvest Lead", photoUrl: null },
			{ name: "Priya Anand", role: "Seeker Coordinator", photoUrl: null },
		],
		whyWorkForUs:
			"We're a family-run operation that treats every seasonal hand like part of the crew — real mentoring, honest pay, and evenings free to explore the valley.",
		hostPerks: ["Shared staff housing", "Daily crew lunch", "Paid travel stipend", "End-of-season bonus"],
	},
	maritime: {
		responsibilities: [
			"Handle lines, nets, and deck gear during sets and hauls",
			"Sort, clean, and ice the catch",
			"Stand assigned watches and keep the deck clear",
			"Wash down and maintain equipment between trips",
		],
		requirements: [
			"Able to work long shifts in cold, wet conditions",
			"Strong swimmer, comfortable at sea",
			"Follows safety direction without hesitation",
			"Prior boat experience helpful but not required",
		],
		perks: [
			"Full catch-share bonus on top of the day rate",
			"All foul-weather gear supplied",
			"Travel to port reimbursed",
		],
		housingDescription:
			"Private berth aboard the vessel with a bunk and storage; shore housing between trips.",
		mealsDescription:
			"All meals are cooked aboard and included, from pre-dawn coffee to dinner after the haul.",
		activities: [
			"Shore hikes on rest days",
			"Wildlife and whale watching",
			"Harbor-town pubs and markets",
			"Fishing-gear swaps with the crew",
		],
		team: [
			{ name: "Dana Whitfield", role: "Skipper", photoUrl: null },
			{ name: "Marco Reyes", role: "First Mate", photoUrl: null },
			{ name: "Priya Anand", role: "Crew Coordinator", photoUrl: null },
		],
		whyWorkForUs:
			"Hard work, big water, and a tight crew — we run a safe, fair boat and share the season's success with everyone aboard.",
		hostPerks: ["Berth aboard included", "All meals at sea", "Foul-weather gear provided", "Catch-share upside"],
	},
	remote: {
		responsibilities: [
			"Welcome and onboard new community members",
			"Moderate channels and keep conversations healthy",
			"Plan and run virtual events and AMAs",
			"Summarize member feedback for the product team",
		],
		requirements: [
			"Reliable high-speed internet and a quiet workspace",
			"Excellent written communication",
			"Self-directed across time zones",
			"1+ year in community, support, or social",
		],
		perks: [
			"Fully remote — work from anywhere",
			"Home-office stipend",
			"Annual team offsite",
		],
		housingDescription:
			"Housing is not included — you keep your own base and work from anywhere.",
		mealsDescription: "Meals are not included with this remote role.",
		activities: [
			"Monthly virtual game nights",
			"Optional regional coworking meetups",
			"Learning-budget book club",
			"Async show-and-tell demos",
		],
		team: [
			{ name: "Dana Whitfield", role: "Head of Community", photoUrl: null },
			{ name: "Marco Reyes", role: "Product Lead", photoUrl: null },
			{ name: "Priya Anand", role: "People Ops", photoUrl: null },
		],
		whyWorkForUs:
			"We've been remote-first since day one — no commute, no office politics, just clear goals, async trust, and a global team that has each other's backs.",
		hostPerks: ["Work from anywhere", "Home-office stipend", "Annual paid offsite", "Flexible hours"],
	},
	seasonal: {
		responsibilities: [
			"Check guests in and out and manage reservations",
			"Answer questions about lifts, trails, and rentals",
			"Coordinate with housekeeping and maintenance",
			"Handle payments and resolve booking issues",
		],
		requirements: [
			"Warm, guest-first attitude",
			"Comfortable with point-of-sale and booking software",
			"Available weekends and holidays in season",
			"Customer-service experience a plus",
		],
		perks: [
			"Free season lift pass",
			"Discounted rentals and lessons",
			"Tips pooled across the front desk",
		],
		housingDescription:
			"Staff dorm room five minutes from the lifts, with heat, laundry, and a shared lounge.",
		mealsDescription:
			"Staff cafeteria open for breakfast and dinner through the season.",
		activities: [
			"Skiing and snowboarding on days off",
			"Backcountry snowshoe tours",
			"Town après-ski scene",
			"Staff movie and game nights",
		],
		team: [
			{ name: "Dana Whitfield", role: "Front Desk Manager", photoUrl: null },
			{ name: "Marco Reyes", role: "Guest Experience Lead", photoUrl: null },
			{ name: "Priya Anand", role: "Housing Coordinator", photoUrl: null },
		],
		whyWorkForUs:
			"A season in the Rockies with a crew that plays as hard as it works — ride every day off, grow your hospitality skills, and finish with a bonus.",
		hostPerks: ["Staff dorm housing", "Season lift pass", "Cafeteria access", "End-of-season bonus"],
	},
	mix: {
		responsibilities: [
			"Greet guests and run smooth check-ins",
			"Keep common areas and dorms clean and welcoming",
			"Host communal dinners and social events",
			"Share local tips and help plan guests' days out",
		],
		requirements: [
			"Sociable and comfortable with travelers from everywhere",
			"Flexible across reception, kitchen, and cleaning",
			"Conversational English; other languages a bonus",
			"Able to commit to at least three months",
		],
		perks: [
			"Private room included",
			"Daily communal dinner",
			"Guest tips shared",
			"Free walking-tour and event access",
		],
		housingDescription:
			"Your own private room in the hostel, with shared bathrooms and a rooftop terrace.",
		mealsDescription:
			"A communal dinner is cooked and shared every evening; the kitchen is open for your own meals.",
		activities: [
			"Sunset viewpoints and tram rides",
			"Surf trips to nearby beaches",
			"Live-music nights in the old town",
			"Pastel de nata crawls",
		],
		team: [
			{ name: "Dana Whitfield", role: "Hostel Host", photoUrl: null },
			{ name: "Marco Reyes", role: "Community Lead", photoUrl: null },
			{ name: "Priya Anand", role: "Kitchen Coordinator", photoUrl: null },
		],
		whyWorkForUs:
			"Life at the hostel is social, sunny, and never boring — trade a few hours a day for a private room, friends from every continent, and the city at your doorstep.",
		hostPerks: ["Private room included", "Daily communal dinner", "Shared guest tips", "Local event access"],
	},
};

function toDetail(f: DiscoveryListing): PublicListingDetail {
	const provided = (p: string | undefined) => p === "provided" || p === "partial";
	const housingIncluded = provided(f.benefits.housing.provision);
	const mealsIncluded = provided(f.benefits.meals.provision);
	const enrich = DETAIL_ENRICHMENT_BY_CATEGORY[f.category];
	// A sourced fixture has NO host block (structural) — mirror the real
	// getListingDetailPublic behavior so the preview journey matches production.
	const isSourced = f.provenanceInfo?.provenance === "sourced";
	return {
		// Fixtures state no logistics: the dev bench must show exactly what a
		// listing whose host answered nothing looks like ("Not stated"), not an
		// invented best case. Real fixtures get real facts only once a host form
		// can produce them.
		logistics: {},
		// Same for category depth (069): a fixture that invented a vessel length
		// would be the one thing this contract exists to prevent — a claim with no
		// host behind it. The dev bench shows the honest empty state.
		categoryDepth: {},
		id: f.id,
		title: f.title,
		category: f.category,
		description: f.host.tagline ?? null,
		locationDisplay: f.location,
		latitude: f.coordinates?.lat ?? null,
		longitude: f.coordinates?.lon ?? null,
		status: "live",
		housingIncluded,
		mealsIncluded,
		compensationSummary: f.benefits.pay.summary ?? null,
		compensationMinCents: f.payInsight?.minCents ?? null,
		compensationMaxCents: f.payInsight?.maxCents ?? null,
		compensationUnit: f.payInsight?.unit ?? null,
		compensationCurrency: f.payInsight?.currency ?? "USD",
		timelineSummary: f.opportunityWindow ?? null,
		beginsAt: toIso(f.begins),
		endsAt: toIso(f.ends),
		publishedAt: toIso(f.begins),
		coverPhotoUrl: f.coverImageUrl ?? null,
		galleryPhotoUrls: [...GALLERY_PHOTO_URLS],
		hostProfileId: null,
		host: isSourced
			? null
			: {
					// Fixture hosts have no public profile row — the empty id tells
					// host-link renderers to skip the link.
					id: "",
					companyName: f.host.name,
					photoUrl: null,
					about: f.host.tagline ?? null,
					primaryLocationName: f.location,
					verified: f.host.verified === true,
				},
		provenanceInfo: f.provenanceInfo,

		// ── Immersive detail sample content (dev/preview only) ──
		// A sourced listing has none of this rich host-authored narrative — the
		// source stated only the basics. Keep it empty so the preview is honest.
		responsibilities: !isSourced && enrich ? [...enrich.responsibilities] : undefined,
		requirements: !isSourced && enrich ? [...enrich.requirements] : undefined,
		perks: !isSourced && enrich ? [...enrich.perks] : undefined,
		// Reuse the listing's real benefit summary first; fall back to the richer
		// per-category descriptor so the "deal, upfront" section reads fully in
		// dev. Only present when the benefit is actually provided.
		housingDescription:
			housingIncluded && enrich
				? f.benefits.housing.summary ?? enrich.housingDescription
				: undefined,
		housingPhotos: HOUSING_PHOTOS_BY_LISTING[f.id],
		mealsDescription:
			mealsIncluded && enrich
				? f.benefits.meals.summary ?? enrich.mealsDescription
				: undefined,
		whyWorkForUs: !isSourced && enrich ? enrich.whyWorkForUs : undefined,
		team: !isSourced && enrich ? enrich.team.map((member) => ({ ...member })) : undefined,
		activities: !isSourced && enrich ? [...enrich.activities] : undefined,
		hostPerks: !isSourced && enrich ? [...enrich.hostPerks] : undefined,
	};
}
