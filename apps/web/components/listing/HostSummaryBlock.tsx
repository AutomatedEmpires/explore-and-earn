import Image from "next/image"
import Link from "next/link"
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui"
import type { ListingHostSummary } from "@explore-and-earn/contracts"
import { ListingSection } from "./ListingSection"
import styles from "./HostSummaryBlock.module.css"

export function HostSummaryBlock({ host }: { readonly host: ListingHostSummary }) {
	const profileHref = host.id ? `/host/${host.id}` : null
	return (
		// Rendered through the shared section shell so this block gets a real
		// heading like every other major section on the page. The page owns the
		// actions — no apply CTA here.
		<ListingSection title="Host" icon="nav.hosts" headingId="listing-host">
			<div className={styles.card}>
				<div className={styles.header}>
					{host.avatar ? (
						<div className={styles.avatarWrap}>
							<Image
								src={host.avatar.masterPath}
								alt={host.avatar.alt}
								fill
								className={styles.avatar}
								sizes="48px"
							/>
						</div>
					) : null}
					<div className={styles.identity}>
						{profileHref ? (
							<Link href={profileHref} className={styles.name}>
								{host.name}
							</Link>
						) : (
							<span className={styles.name}>{host.name}</span>
						)}
						{host.location && <span className={styles.location}>Based in {host.location}</span>}
					</div>
				</div>
				{host.verified ? <VerifiedHostBadge /> : null}
				{host.tagline ? <p className={styles.tagline}>{host.tagline}</p> : null}
				{profileHref && (
					<Link href={profileHref} className={styles.viewLink}>
						View host profile
						<Icon name="action.forward" size={16} aria-hidden />
					</Link>
				)}
			</div>
		</ListingSection>
	)
}
