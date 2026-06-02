import { Button, Meter } from "@explore-and-earn/ui"
import { BenefitTriadDetail } from "./BenefitTriadDetail"
import { CategoryBadge } from "./CategoryBadge"
import type { ListingDetailData } from "./fixtures"
import { HostSummaryBlock } from "./HostSummaryBlock"
import { ImageGallery } from "./ImageGallery"

export function ListingDetail({ listing }: { readonly listing: ListingDetailData }) {
	return (
		<main
			style=
				display: "flex",
				flexDirection: "column",
				gap: "var(--space-section)",
				maxWidth: "var(--bp-md)",
				margin: "0 auto",
				padding: "var(--space-gutter)",
				background: "var(--color-paper)",
				color: "var(--text-primary)",
				minHeight: "100%",
			
		>
			<ImageGallery images={listing.gallery} title={listing.title} />

			<header style= display: "flex", flexDirection: "column", gap: "var(--space-8)" >
				<div
					style=
						display: "flex",
						alignItems: "center",
						gap: "var(--space-8)",
						flexWrap: "wrap",
					
				>
					<CategoryBadge category={listing.category} />
					{listing.matchScore != null ? (
						<Meter value={listing.matchScore} label="MATCH" />
					) : null}
				</div>
				<h1
					style=
						margin: "0",
						fontFamily: "var(--font-display)",
						fontSize: "var(--type-page-size)",
						lineHeight: "var(--type-page-lh)",
					
				>
					{listing.title}
				</h1>
				<p
					style=
						margin: "0",
						fontFamily: "var(--font-ui)",
						fontSize: "var(--type-meta-size)",
						lineHeight: "var(--type-meta-lh)",
						color: "var(--text-secondary)",
					
				>
					{listing.location} · {listing.opportunityWindow}
				</p>
			</header>

			<section
				aria-label="About this opportunity"
				style= display: "flex", flexDirection: "column", gap: "var(--space-12)" 
			>
				{listing.description.map((paragraph, index) => (
					<p
						key={`para-${index}`}
						style=
							margin: "0",
							fontFamily: "var(--font-ui)",
							fontSize: "var(--type-body-size)",
							lineHeight: "var(--type-body-lh)",
							color: "var(--text-secondary)",
						
					>
						{paragraph}
					</p>
				))}
			</section>

			<section
				aria-label="What is provided"
				style= display: "flex", flexDirection: "column", gap: "var(--space-12)" 
			>
				<h2
					style=
						margin: "0",
						fontFamily: "var(--font-display)",
						fontSize: "var(--type-section-size)",
						lineHeight: "var(--type-section-lh)",
					
				>
					Housing, meals & pay
				</h2>
				<BenefitTriadDetail benefits={listing.benefits} />
			</section>

			<HostSummaryBlock host={listing.host} />

			<div style= display: "flex" >
				<Button variant="primary" icon="action.apply" type="button">
					Apply to this opportunity
				</Button>
			</div>
		</main>
	)
}
