import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import { SitePhoto } from "../../../../components/media/SitePhoto";
import { SITE_PHOTOS, sitePhotoSources } from "../../../../lib/sitePhotos";
import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Photo credits",
		description:
			"Every photograph on Explore & Earn, with its photographer, licence and original source.",
		alternates: { canonical: "/credits" },
		robots: { index: true, follow: true },
	};
}

/**
 * /credits — the attribution surface for site photography.
 *
 * This page is not decoration. It is how the CC-BY / CC-BY-SA attribution
 * CONDITION is satisfied for the Wikimedia Commons photographs, and how the
 * Unsplash API guideline on crediting photographers is honoured for the
 * Unsplash ones. It renders EVERY entry in the catalog — driven straight off
 * the manifest, so a photo can never ship without its credit appearing here.
 *
 * Note on people: some photographs contain people. They are stock/public-domain
 * images licensed for use, NOT photographs of Explore & Earn hosts, workers or
 * members, and nothing on this site presents them as such.
 */
export default function CreditsPage() {
	const sources = sitePhotoSources();

	return (
		<>
			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroCredits}`}>
				<span className={styles.heroIcon}>
					<Icon name="nav.seek" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Photo credits.</h1>
				<p className={styles.heroSub}>
					Every photograph on this site, who took it, and the licence it&rsquo;s used
					under. If a photo is here, its credit is here.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>
						{SITE_PHOTOS.length} photographs
					</span>
					{sources.map((source) => (
						<span key={source} className={`${styles.badge} ${styles.badgeSky}`}>
							{source}
						</span>
					))}
				</div>
			</div>

			{/* The credit list */}
			<section id="photographs" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.seek" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Photographs</h2>
				</div>

				<ul className={styles.creditList} role="list">
					{SITE_PHOTOS.map((photo) => (
						<li key={photo.slug} className={styles.creditCard}>
							{/* Proof-of-asset thumbnail: the credit sits next to the actual
							    image it describes, not next to a slug. */}
							<SitePhoto
								slug={photo.slug}
								size="card"
								className={styles.creditThumb}
								sizes="(max-width: 40rem) 30vw, 8rem"
							/>
							<div className={styles.creditBody}>
								<p className={styles.creditAuthor}>
									<a
										className={styles.creditLink}
										href={photo.authorUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										{photo.author}
									</a>
								</p>
								<p className={styles.creditMeta}>
									<a
										className={styles.creditLink}
										href={photo.licenseUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										{photo.license}
									</a>
									{" · "}
									<a
										className={styles.creditLink}
										href={photo.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										{photo.source}
									</a>
								</p>
								<p className={styles.creditAlt}>{photo.alt}</p>
							</div>
						</li>
					))}
				</ul>
			</section>

			{/* How we source */}
			<section id="how-we-source" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>How we source photography</h2>
				</div>
				<ul className={styles.list}>
					<li className={styles.listItem}>
						<span className={styles.listDot} />
						<span>
							We only use photographs under the Unsplash License, CC0, public
							domain, CC BY, or CC BY-SA. Anything NonCommercial, NoDerivatives,
							or of unclear licence is rejected rather than used carefully.
						</span>
					</li>
					<li className={styles.listItem}>
						<span className={styles.listDot} />
						<span>
							Photographs are optimised and served from this site. Camera
							metadata, including any GPS location, is stripped before an image
							is published.
						</span>
					</li>
					<li className={styles.listItem}>
						<span className={styles.listDot} />
						<span>
							Some photographs include people. They are licensed stock or
							public-domain images — not photographs of Explore &amp; Earn hosts,
							workers, or members — and we never present them as such.
						</span>
					</li>
				</ul>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Something wrong?</h2>
				</div>
				<p className={styles.body}>
					If you are a photographer and a credit here is wrong, incomplete, or you
					want an image removed, email us and we will fix it.
				</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
