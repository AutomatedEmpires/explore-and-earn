import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
	allBuckets,
	bucketFill,
	bucketFolder,
	bucketPhotoUrl,
	SITE_PHOTOS_BUCKET,
} from "../../../../../lib/photoBuckets";
import styles from "./photo-buckets.module.css";

export const metadata: Metadata = {
	title: "Photo buckets",
	robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Photo Buckets manager — a read-through view of the nine app photo buckets and
 * every storage object they carry. The buckets are a typed config
 * (apps/web/lib/photoBuckets.ts): add/remove entries there after uploading into
 * the documented `buckets/{bucket}/…` folder of the public `site-photos`
 * Supabase Storage bucket. There are no placeholder slots — a bucket lists only
 * objects that really exist, so an unpopulated bucket says so plainly rather
 * than rendering a fake tile. Founder-gated by the (admin) layout.
 */
export default function PhotoBucketsPage() {
	const buckets = allBuckets();

	return (
		<section className={styles.page}>
			<header className={styles.head}>
				<span className={styles.kicker}>
					<Icon name="nav.photos" size={16} aria-hidden />
					Media library
				</span>
				<h1 className={styles.title}>Photo buckets</h1>
				<p className={styles.sub}>
					The nine predefined image buckets offered across the app. Each entry is
					an object path in the public{" "}
					<code className={styles.code}>{SITE_PHOTOS_BUCKET}</code> storage
					bucket. Seed with{" "}
					<code className={styles.code}>node scripts/seed-site-photos.mjs</code>,
					then wire the entries into{" "}
					<code className={styles.code}>apps/web/lib/photoBuckets.ts</code>.
				</p>
				<div className={styles.conventionCard}>
					<span className={styles.conventionLabel}>Upload folder convention</span>
					<code className={styles.conventionCode}>
						buckets/&#123;bucket&#125;/&#123;slug&#125;
						<span className={styles.conventionMuted}>
							{"  ·  "}category buckets: buckets/&#123;bucket&#125;/&#123;category&#125;/&#123;slug&#125;
						</span>
					</code>
				</div>
			</header>

			<div className={styles.buckets}>
				{buckets.map((bucket) => {
					const fill = bucketFill(bucket.id);
					return (
						<article key={bucket.id} className={styles.bucket}>
							<div className={styles.bucketHead}>
								<div className={styles.bucketHeadMain}>
									<h2 className={styles.bucketTitle}>{bucket.label}</h2>
									<code className={styles.bucketId}>{bucket.id}</code>
								</div>
								<span
									className={styles.fill}
									data-empty={fill.filled === 0 ? "true" : undefined}
								>
									{fill.filled} {fill.filled === 1 ? "photo" : "photos"}
								</span>
							</div>
							<p className={styles.bucketDesc}>{bucket.description}</p>

							{bucket.sections.map((section) => (
								<div key={section.key} className={styles.section}>
									<div className={styles.sectionHead}>
										{bucket.partitioned ? (
											<span className={styles.sectionLabel}>{section.label}</span>
										) : null}
										<code className={styles.folder}>
											{bucketFolder(bucket.id, section.folderKey ?? undefined)}/
										</code>
									</div>
									{section.entries.length === 0 ? (
										<p className={styles.entryTodo}>
											No photos uploaded to this folder yet.
										</p>
									) : (
										<ul className={styles.entries}>
											{section.entries.map((entry) => (
												<li key={entry.id} className={styles.entry}>
													<div className={styles.thumb}>
														<Image
															src={bucketPhotoUrl(entry.path, "thumb")}
															alt=""
															fill
															sizes="120px"
															className={styles.thumbImg}
														/>
													</div>
													<div className={styles.entryMeta}>
														<span className={styles.entryLabel}>{entry.label}</span>
														<code className={styles.entryId}>{entry.path}</code>
													</div>
												</li>
											))}
										</ul>
									)}
								</div>
							))}
						</article>
					);
				})}
			</div>

			<div className={styles.footRow}>
				<Link className={styles.foot} href="/admin">
					<Icon name="analytics.meter" size={20} aria-hidden />
					Marketplace overview
				</Link>
			</div>
		</section>
	);
}
