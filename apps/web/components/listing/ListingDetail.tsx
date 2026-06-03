import type { CSSProperties } from "react"
import { Button, Meter } from "@explore-and-earn/ui"
import { BenefitTriadDetail } from "./BenefitTriadDetail"
import { CategoryBadge } from "./CategoryBadge"
import type { ListingDetailData } from "./fixtures"
import { HostSummaryBlock } from "./HostSummaryBlock"
import { ImageGallery } from "./ImageGallery"

const mainStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-section)",
	maxWidth: "var(--bp-md)",
	margin: "0 auto",
	padding: "var(--space-gutter)",
	background: "var(--color-paper)",
	color: "var(--text-primary)",
	minHeight: "100%",
}

const headerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-8)",
}

const badgeRowStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "var(--space-8)",
	flexWrap: "wrap",
}

const titleStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-page-size)",
	lineHeight: "var(--type-page-lh)",
}

const metaStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-meta-size)",
	lineHeight: "var(--type-meta-lh)",
	color: "var(--text-secondary)",
}

const sectionStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-12)",
}

const paragraphStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	lineHeight: "var(--type-body-lh)",
	color: "var(--text-secondary)",
}

const sectionTitleStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-section-size)",
	lineHeight: "var(--type-section-lh)",
}

const ctaRowStyle: CSSProperties = {
	display: "flex",
}

export function ListingDetail({ listing }: { readonly listing: ListingDetailData }) {
	return (
		<main style={mainStyle}>
			<ImageGallery images={listing.gallery} title={listing.title} />
			<header style={headerStyle}>
				<div style={badgeRowStyle}>
					<CategoryBadge category={listing.category} />
					{listing.matchScore != null ? (
						<Meter value={listing.matchScore} label="MATCH" />
					) : null}
				</div>
				<h1 style={titleStyle}>{listing.title}</h1>
				<p style={metaStyle}>
					{listing.location} · {listing.opportunityWindow}
				</p>
			</header>
			<section aria-label="About this opportunity" style={sectionStyle}>
				{listing.description.map((paragraph, index) => (
					<p key={`para-${index}`} style={paragraphStyle}>
						{paragraph}
					</p>
				))}
			</section>
			<section aria-label="What is provided" style={sectionStyle}>
				<h2 style={sectionTitleStyle}>Housing, meals & pay</h2>
				<BenefitTriadDetail benefits={listing.benefits} />
			</section>
			<HostSummaryBlock host={listing.host} />
			<div style={ctaRowStyle}>
				<Button variant="primary" icon="action.apply" type="button">
					Apply to this opportunity
				</Button>
			</div>
		</main>
	)
}
