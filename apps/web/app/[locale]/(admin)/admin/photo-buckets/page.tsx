import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
	allBuckets,
	bucketFill,
	bucketFolder,
	bucketPhotoUrl,
} from "../../../../../lib/photoBuckets";
import styles from "./photo-buckets.module.css";

export const metadata: Metadata = {
	title: "Photo buckets",
	robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Photo Buckets manager — a simple, read-through view of the nine app photo
 * buckets and every Cloudinary public ID they carry. The buckets are a typed
 * config (apps/web/lib/photoBuckets.ts): add/remove entries there, or upload new
 * images into the documented ee/buckets/{bucket}/… folders and point an entry at
 * the new public ID. Reserved "to populate" slots render honestly — never a fake
 * image. Founder-gated by the (admin) layout.
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
					a Cloudinary public ID. Edit the typed config in{" "}
					<code className={styles.code}>apps/web/lib/photoBuckets.ts</code>, or
					upload into the documented folder for a bucket and add the new ID.
				</p>
				<div className={styles.conventionCard}>
					<span className={styles.conventionLabel}>Upload folder convention</span>
					<code className={styles.conventionCode}>
						ee/buckets/&#123;bucket&#125;/&#123;slug&#125;
						<span className={styles.conventionMuted}>
							{"  ·  "}category buckets: ee/buckets/&#123;bucket&#125;/&#123;category&#125;/&#123;slug&#125;
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
									{fill.filled}/{fill.total} populated
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
									<ul className={styles.entries}>
										{section.entries.map((entry) => (
											<li key={entry.id} className={styles.entry}>
												<div className={styles.thumb}>
													{entry.publicId ? (
														<Image
															src={bucketPhotoUrl(entry.publicId, "thumb")}
															alt=""
															fill
															sizes="120px"
															className={styles.thumbImg}
														/>
													) : (
														<span className={styles.thumbEmpty} aria-hidden>
															<Icon name="nav.photos" size={18} />
														</span>
													)}
												</div>
												<div className={styles.entryMeta}>
													<span className={styles.entryLabel}>{entry.label}</span>
													{entry.publicId ? (
														<code className={styles.entryId}>{entry.publicId}</code>
													) : (
														<span className={styles.entryTodo}>
															To populate — no image yet
														</span>
													)}
												</div>
											</li>
										))}
									</ul>
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
