import type {
	DiscoveryCardConditionalBadge,
	DiscoveryCardSurface,
	MarketplaceCategory,
	OpportunityTriad,
} from "@explore-and-earn/contracts"

import { Icon, type IconKey } from "./icons"
import { VerifiedHostBadge } from "./VerifiedHostBadge"

/**
 * DiscoveryCard — the central product primitive.
 *
 * Canon (product-principles.md): ONE card component serves every surface
 * (homepage / discovery_feed / swipe / map / saved / matched / ...). The
 * Housing / Meals / Pay triad is ALWAYS first-class and visible — never buried,
 * never relabeled "Perks". Verified Host always carries its self-declared
 * qualifier (G22). Categories are the five locked lanes; "lodge" is a setting
 * under seasonal, never its own lane.
 *
 * This is the lightweight V1: tokens + icon registry + typed contracts, styled
 * via class names (see apps/web/styles/components.css). No data layer, no
 * matching, no apply handler are wired here — those remain founder-gated.
 */
export interface DiscoveryOpportunity {
	readonly id: string
	readonly category: MarketplaceCategory
	readonly jobTitle: string
	readonly hostName: string
	readonly location: string
	readonly opportunityWindow: string
	readonly triad: OpportunityTriad
	readonly verifiedHost?: boolean
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[]
	readonly matchScore?: number
}

export interface DiscoveryCardProps {
	readonly opportunity: DiscoveryOpportunity
	readonly surface?: DiscoveryCardSurface
}

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
}

const CONDITIONAL_BADGE_LABELS: Record<DiscoveryCardConditionalBadge, string> = {
	seasonal: "Seasonal",
	featured: "Featured",
	boosted: "Boosted",
}

export function DiscoveryCard({
	opportunity,
	surface = "discovery_feed",
}: DiscoveryCardProps) {
	const {
		category,
		jobTitle,
		hostName,
		location,
		opportunityWindow,
		triad,
		verifiedHost = true,
		conditionalBadges = [],
		matchScore,
	} = opportunity

	const categoryIcon = `category.${category}` as IconKey
	const showMatch = surface === "matched" && typeof matchScore === "number"

	return (
		<article
			className="discovery-card"
			data-category={category}
			data-surface={surface}
		>
			<div className="discovery-card__hero" aria-hidden>
				<span className="discovery-card__category-badge">
					<Icon aria-hidden name={categoryIcon} size={16} />
					<span>{CATEGORY_LABELS[category]}</span>
				</span>
				{conditionalBadges.length > 0 ? (
					<span className="discovery-card__pills">
						{conditionalBadges.map((badge) => (
							<span
								key={badge}
								className="discovery-card__pill"
								data-badge={badge}
							>
								{CONDITIONAL_BADGE_LABELS[badge]}
							</span>
						))}
					</span>
				) : null}
			</div>

			<div className="discovery-card__body">
				<div className="discovery-card__host">
					<Icon aria-hidden name="nav.profile" size={20} />
					<span className="discovery-card__host-name">{hostName}</span>
					{verifiedHost ? <VerifiedHostBadge /> : null}
				</div>

				<h3 className="discovery-card__title">{jobTitle}</h3>

				<p className="discovery-card__meta">
					<span>{location}</span>
					<span className="discovery-card__dot" aria-hidden>
						&middot;
					</span>
					<span>{opportunityWindow}</span>
				</p>

				<dl className="discovery-card__triad" aria-label="Housing, meals, and pay">
					<div className="triad-cell" data-benefit="housing">
						<Icon aria-hidden name="benefit.housing" size={20} />
						<dt className="triad-cell__label">Housing</dt>
						<dd className="triad-cell__value">{triad.housing}</dd>
					</div>
					<div className="triad-cell" data-benefit="meals">
						<Icon aria-hidden name="benefit.meals" size={20} />
						<dt className="triad-cell__label">Meals</dt>
						<dd className="triad-cell__value">{triad.meals}</dd>
					</div>
					<div className="triad-cell" data-benefit="pay">
						<Icon aria-hidden name="benefit.pay" size={20} />
						<dt className="triad-cell__label">Pay</dt>
						<dd className="triad-cell__value">{triad.pay}</dd>
					</div>
				</dl>

				<div className="discovery-card__footer">
					{showMatch ? (
						<span className="discovery-card__match">
							<Icon aria-hidden name="status.match" size={16} />
							<span>{matchScore}% match</span>
						</span>
					) : null}
					<button type="button" className="discovery-card__apply">
						<Icon aria-hidden name="action.apply" size={16} />
						<span>Quick Apply</span>
					</button>
				</div>
			</div>
		</article>
	)
}
