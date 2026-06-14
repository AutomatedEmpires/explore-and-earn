import Image from "next/image"
import Link from "next/link"
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui"
import type { ListingHostSummary } from "./fixtures"
import styles from "./HostSummaryBlock.module.css"

export function HostSummaryBlock({ host }: { readonly host: ListingHostSummary }) {
	const profileHref = host.id ? `/host/${host.id}` : null
	return (
		<section aria-label="About the host" className={styles.section}>
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
		</section>
	)
}
