import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { IconKey } from "@explore-and-earn/ui";
import {
	getEditorialPosts,
	type EditorialPost,
	type EditorialTone,
} from "../../lib/editorial";
import styles from "./page.module.css";

export const dynamic = "force-static";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

const TITLE = "Field Guide · Explore & Earn";
const DESCRIPTION =
	"Honest guides, field notes, and playbooks for seasonal work — how to read housing, meals, and pay before you pack.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: `${baseUrl}/blog` },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: `${baseUrl}/blog`,
		type: "website",
	},
};

/** Per-tone accent (semantic status tokens only — no raw color). */
function toneAccent(tone: EditorialTone): string {
	switch (tone) {
		case "farm":
			return "var(--status-success-fg)";
		case "maritime":
			return "var(--color-cta)";
		case "remote":
			return "var(--status-match-fg)";
		case "seasonal":
			return "var(--status-boosted-fg)";
	}
}

/** Per-tone registry icon (category lanes). */
function toneIcon(tone: EditorialTone): IconKey {
	switch (tone) {
		case "farm":
			return "category.farm";
		case "maritime":
			return "category.maritime";
		case "remote":
			return "category.remote";
		case "seasonal":
			return "category.seasonal";
	}
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default function BlogIndexPage() {
	const posts = getEditorialPosts();
	const [lead, ...rest] = posts;

	return (
		<div className={styles.page}>
			{/* ── Masthead ─────────────────────────────────────────────────── */}
			<header className={styles.masthead}>
				<span className={styles.kicker}>
					<Icon name="nav.feed" size={16} aria-hidden />
					The Field Guide
				</span>
				<h1 className={styles.mastTitle}>
					Read the season<br />before you live it.
				</h1>
				<p className={styles.mastSub}>
					Honest guides and field notes from the road — how to weigh housing,
					meals, and pay so a season pays off, not just sounds good.
				</p>
			</header>

			{/* ── Lead story ───────────────────────────────────────────────── */}
			{lead && (
				<Link
					href={`/blog/${lead.slug}`}
					className={styles.lead}
					style={{ "--tone": toneAccent(lead.tone) } as CSSProperties}
				>
					<div className={styles.leadPlate} aria-hidden="true">
						<span className={styles.plateSeam} />
						<span className={styles.plateIcon}>
							<Icon name={toneIcon(lead.tone)} size={24} aria-hidden />
						</span>
						<span className={styles.plateTone}>{lead.tone}</span>
					</div>
					<div className={styles.leadBody}>
						<span className={styles.kindBadge}>{lead.kind}</span>
						<h2 className={styles.leadTitle}>{lead.title}</h2>
						<p className={styles.leadExcerpt}>{lead.excerpt}</p>
						<PostMeta post={lead} />
					</div>
				</Link>
			)}

			{/* ── The rest ─────────────────────────────────────────────────── */}
			{rest.length > 0 && (
				<section className={styles.grid} aria-label="More from the field guide">
					{rest.map((post) => (
						<Link
							key={post.slug}
							href={`/blog/${post.slug}`}
							className={styles.card}
							style={{ "--tone": toneAccent(post.tone) } as CSSProperties}
						>
							<div className={styles.cardPlate} aria-hidden="true">
								<span className={styles.plateSeam} />
								<span className={styles.plateIcon}>
									<Icon name={toneIcon(post.tone)} size={24} aria-hidden />
								</span>
								<span className={styles.plateTone}>{post.tone}</span>
							</div>
							<div className={styles.cardBody}>
								<span className={styles.kindBadge}>{post.kind}</span>
								<h2 className={styles.cardTitle}>{post.title}</h2>
								<p className={styles.cardExcerpt}>{post.excerpt}</p>
								<PostMeta post={post} />
							</div>
						</Link>
					))}
				</section>
			)}
		</div>
	);
}

function PostMeta({ post }: { post: EditorialPost }) {
	return (
		<p className={styles.meta}>
			<span className={styles.metaAuthor}>{post.author}</span>
			<span className={styles.metaDot} aria-hidden="true">·</span>
			<span>{formatDate(post.publishedAt)}</span>
			<span className={styles.metaDot} aria-hidden="true">·</span>
			<span>{post.readMinutes} min read</span>
		</p>
	);
}
