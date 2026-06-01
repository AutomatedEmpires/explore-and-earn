/**
 * Discovery Card props contract — ONE shared card across every surface.
 *
 * Source of truth (Notion): Canonical Card System Specification, Discovery Card
 * V1 Build Pack, Badge System Spec. Mirrored at docs/product/discovery-card-v1.md.
 *
 * SPRINT ZERO: prop + enum contracts ONLY. No card implementation, no analytics
 * transport, no data fetching. The shared skeleton lives in packages/ui later.
 */
import type { OpportunityCategory } from "./categories";
import type { BenefitTriad } from "./benefits";
import type { VerifiedHostState } from "./trust";
import type { ImageSelection } from "./media";
import type { ListingStatus } from "./lifecycles";

/** Surfaces the one card renders on (compose by variant, never fork). */
export const CARD_SURFACES = [
	"seek",
	"swipe",
	"map_popup",
	"map_drawer",
	"feed",
	"matched",
	"boosted",
	"matched_boosted",
	"host_review",
	"admin_review",
] as const;
export type CardSurface = (typeof CARD_SURFACES)[number];

/** The 8 universal card zones (anatomy is fixed; content varies). */
export const CARD_ZONES = [
	"media",
	"identity",
	"badge_status",
	"title",
	"metadata",
	"benefit_trust",
	"action",
	"overflow",
] as const;
export type CardZone = (typeof CARD_ZONES)[number];

/** Visual / interaction states. Status is never color-only (pair with icon + text). */
export const CARD_STATES = [
	"default",
	"hover",
	"focus",
	"active",
	"selected",
	"disabled",
	"locked",
	"boosted",
	"matched",
	"reported",
	"under_review",
] as const;
export type CardState = (typeof CARD_STATES)[number];

/**
 * Canonical analytics events emitted by the card. DO NOT invent new names —
 * extend only from the Notion event registry.
 */
export const DISCOVERY_CARD_EVENTS = [
	"card_impression",
	"card_opened",
	"card_action_clicked",
	"save_clicked",
	"apply_clicked",
	"report_clicked",
	"match_score_clicked",
	"housing_clicked",
	"meals_clicked",
	"boost_clicked",
] as const;
export type DiscoveryCardEvent = (typeof DISCOVERY_CARD_EVENTS)[number];

/** Match is a relevance/trust signal (0–100); rendered neutral, never red/green. */
export interface MatchSignal {
	/** 0..100. */
	readonly score: number;
}

/** The data a Discovery Card renders. Housing/Meals/Pay are ALWAYS present. */
export interface DiscoveryCardData {
	readonly listingId: string;
	readonly hostId: string;
	readonly hostName: string;
	readonly title: string;
	readonly category: OpportunityCategory;
	readonly locationLabel: string;
	/** Opportunity window (ISO dates). */
	readonly beginsOn?: string;
	readonly endsOn?: string;
	/** Mandatory triad. */
	readonly benefits: BenefitTriad;
	readonly verifiedHost: VerifiedHostState;
	readonly status: ListingStatus;
	/** Hero media (resolved upload or curated; fallback illustration when absent). */
	readonly cover?: ImageSelection;
	readonly hostAvatar?: ImageSelection;
	/** Conditional signals. */
	readonly match?: MatchSignal;
	readonly boosted?: boolean;
	readonly featured?: boolean;
}

/** Props for the shared card component (built later in packages/ui). */
export interface DiscoveryCardProps {
	readonly data: DiscoveryCardData;
	readonly surface: CardSurface;
	readonly state?: CardState;
	/** Analytics sink; receives only canonical event names. */
	readonly onEvent?: (event: DiscoveryCardEvent, listingId: string) => void;
	readonly onOpen?: () => void;
	readonly onApply?: () => void;
	readonly onSave?: () => void;
}
