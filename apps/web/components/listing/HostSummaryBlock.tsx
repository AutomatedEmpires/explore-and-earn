import Link from "next/link"
import { VerifiedHostBadge } from "@explore-and-earn/ui"
import type { ListingHostSummary } from "./fixtures"

export function HostSummaryBlock({ host }: { readonly host: ListingHostSummary }) {
	const profileHref = `/host/${host.id}`
	return (
		<section
			aria-label="About the host"
			style=
				display: "flex",
				flexDirection: "column",
				gap: "var(--space-12)",
				background: "var(--color-surface-raised)",
				borderRadius: "var(--radius-card)",
				padding: "var(--space-card)",
			
		>
			<div style= display: "flex", alignItems: "center", gap: "var(--space-12)" >
				{host.avatar ? (
					<img
						src={host.avatar.masterPath}
						alt={host.avatar.alt}
						width={host.avatar.width}
						height={host.avatar.height}
						style=
							width: "var(--space-48)",
							height: "var(--space-48)",
							borderRadius: "var(--radius-pill)",
							objectFit: "cover",
							background: "var(--color-surface)",
						
					/>
				) : null}
				<div style= display: "flex", flexDirection: "column", gap: "var(--space-4)" >
					<Link
						href={profileHref}
						style=
							fontFamily: "var(--font-display)",
							fontSize: "var(--type-card-size)",
							lineHeight: "var(--type-card-lh)",
							color: "var(--text-primary)",
							textDecoration: "none",
						
					>
						{host.name}
					</Link>
					<span
						style=
							fontFamily: "var(--font-ui)",
							fontSize: "var(--type-meta-size)",
							lineHeight: "var(--type-meta-lh)",
							color: "var(--text-secondary)",
						
					>
						Based in {host.location}
					</span>
				</div>
			</div>
			{host.verified ? <VerifiedHostBadge /> : null}
			{host.tagline ? (
				<p
					style=
						margin: "0",
						fontFamily: "var(--font-ui)",
						fontSize: "var(--type-body-size)",
						lineHeight: "var(--type-body-lh)",
						color: "var(--text-secondary)",
					
				>
					{host.tagline}
				</p>
			) : null}
			<Link
				href={profileHref}
				style=
					fontFamily: "var(--font-ui)",
					fontSize: "var(--type-button-size)",
					lineHeight: "var(--type-body-lh)",
					color: "var(--status-match-fg)",
				
			>
				View host profile →
			</Link>
		</section>
	)
}
