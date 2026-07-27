import { MARKETPLACE_LANES, type MixDomain } from "@explore-and-earn/contracts";

/**
 * Category landing pages contract — /jobs/{farm|maritime|remote|seasonal}.
 *
 * The four indexable lanes are exactly MARKETPLACE_LANES (the founder-locked
 * MIX_DOMAIN). "mix" is a derived listing presentation, never a public lane —
 * it gets NO landing page (enums.ts DR-B6). All copy here REUSES
 * founder-approved language verbatim (home-data.ts HOME_CATEGORIES labels +
 * blurbs, the triad register "housing, meals & pay upfront") — landing pages
 * must never invent marketplace claims (no-fabrication law). A parity test
 * (tests/unit/category-landing.test.ts) pins labels/blurbs to the founder
 * source so the two can't drift silently.
 */

export type LandingCategory = MixDomain;

/** The four landing lanes, in the canonical founder order. */
export const LANDING_CATEGORIES: readonly LandingCategory[] = MARKETPLACE_LANES;

export function isLandingCategory(raw: string): raw is LandingCategory {
	return (LANDING_CATEGORIES as readonly string[]).includes(raw);
}

export interface CategoryLandingCopy {
	/** Founder lane label (== HOME_CATEGORIES label). */
	readonly label: string;
	/** Founder lane blurb (== HOME_CATEGORIES blurb) — carries the sub-role breadth. */
	readonly blurb: string;
	/** SEO title — bare; the root template appends "| Explore & Earn". */
	readonly title: string;
	/** Meta description — triad-forward, zero invented numbers or claims. */
	readonly description: string;
	/** On-page H1. */
	readonly heading: string;
}

/**
 * There is deliberately NO hero-image field. The lane heroes were curated
 * marketing photographs served by an image CDN we no longer use, and we hold no
 * replacement photography — so the hero band paints the lane's own cover
 * gradient (jobs.module.css, keyed by `data-category`) rather than pointing at
 * an asset that is not there. A `heroPhotoPath` returns here when curated lane
 * photography lands in the `site-photos` bucket (docs/design/site-photos.md).
 */

const TRIAD = "housing, meals & pay upfront";

export const CATEGORY_LANDING: Record<LandingCategory, CategoryLandingCopy> = {
	farm: {
		label: "Farm",
		blurb: "Orchards, ranches, harvests & greenhouses",
		title: `Farm jobs with ${TRIAD}`,
		heading: `Farm jobs with ${TRIAD}`,
		description:
			"Orchards, ranches, harvests & greenhouses — seasonal farm work where every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	},
	maritime: {
		label: "Maritime",
		blurb: "Boats, docks, fisheries & processing",
		title: `Maritime jobs with ${TRIAD}`,
		heading: `Maritime jobs with ${TRIAD}`,
		description:
			"Boats, docks, fisheries & processing — maritime work where every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	},
	remote: {
		label: "Remote",
		blurb: "Cabins, backcountry ops, guiding & off-grid",
		title: `Remote jobs with ${TRIAD}`,
		heading: `Remote jobs with ${TRIAD}`,
		description:
			"Cabins, backcountry ops, guiding & off-grid — remote-place work where every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	},
	seasonal: {
		label: "Seasonal",
		blurb: "Lodges, resorts, parks & hospitality",
		title: `Seasonal jobs with ${TRIAD}`,
		heading: `Seasonal jobs with ${TRIAD}`,
		description:
			"Lodges, resorts, parks & hospitality — seasonal work where every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	},
};

/** Canonical path for a landing lane. */
export function categoryLandingPath(category: LandingCategory): string {
	return `/jobs/${category}`;
}

/**
 * Metadata for a landing lane — pure and testable. Bare title (root template
 * brands it), canonical guards UTM/query variants, robots explicit like
 * /search.
 */
export function buildCategoryLandingMetadata(category: LandingCategory): {
	title: string;
	description: string;
	alternates: { canonical: string };
	openGraph: { title: string; description: string; url: string };
	robots: { index: true; follow: true };
} {
	const copy = CATEGORY_LANDING[category];
	const path = categoryLandingPath(category);
	return {
		title: copy.title,
		description: copy.description,
		alternates: { canonical: path },
		openGraph: { title: copy.title, description: copy.description, url: path },
		robots: { index: true, follow: true },
	};
}
