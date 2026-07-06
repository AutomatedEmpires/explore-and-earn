import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { IconKey } from "@explore-and-earn/ui";
import {
	getEditorialPost,
	getEditorialPosts,
	type EditorialTone,
} from "../../../lib/editorial";
import { escapeJsonLdHtml } from "../../../lib/seo";
import styles from "./page.module.css";

export const dynamic = "force-static";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
	params: Promise<{ slug: string }>;
}

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

export function generateStaticParams(): Array<{ slug: string }> {
	return getEditorialPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = getEditorialPost(slug);

	if (!post) {
		return { title: "Article not found" };
	}

	const title = post.title;
	const canonical = `${baseUrl}/blog/${post.slug}`;

	return {
		title,
		description: post.excerpt,
		alternates: { canonical },
		openGraph: {
			title,
			description: post.excerpt,
			url: canonical,
			type: "article",
			publishedTime: post.publishedAt,
			authors: [post.author],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description: post.excerpt,
		},
	};
}

export default async function BlogArticlePage({ params }: Props) {
	const { slug } = await params;
	const post = getEditorialPost(slug);

	if (!post) notFound();

	const moreReading = getEditorialPosts()
		.filter((p) => p.slug !== post.slug)
		.slice(0, 3);

	const articleJsonLd = escapeJsonLdHtml(
		JSON.stringify(
			{
				"@context": "https://schema.org",
				"@type": "Article",
				headline: post.title,
				description: post.excerpt,
				datePublished: post.publishedAt,
				author: { "@type": "Organization", name: post.author },
				publisher: {
					"@type": "Organization",
					name: "Explore & Earn",
					url: baseUrl,
				},
				mainEntityOfPage: {
					"@type": "WebPage",
					"@id": `${baseUrl}/blog/${post.slug}`,
				},
				articleSection: post.kind,
			},
			null,
			2,
		),
	);

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: articleJsonLd }}
			/>

			<article
				className={styles.article}
				style={{ "--tone": toneAccent(post.tone) } as CSSProperties}
			>
				{/* ── Back to the index ───────────────────────────────────────── */}
				<Link href="/blog" className={styles.backLink}>
					<Icon name="action.back" size={16} aria-hidden />
					Field Guide
				</Link>

				{/* ── Hero — tone plate + kind badge + title + meta ───────────── */}
				<header className={styles.hero}>
					<div className={styles.heroPlate} aria-hidden="true">
						<span className={styles.plateSeam} />
						<span className={styles.plateIcon}>
							<Icon name={toneIcon(post.tone)} size={24} aria-hidden />
						</span>
						<span className={styles.plateTone}>{post.tone}</span>
					</div>

					<span className={styles.kindBadge}>{post.kind}</span>
					<h1 className={styles.title}>{post.title}</h1>
					<p className={styles.lede}>{post.excerpt}</p>

					<p className={styles.meta}>
						<span className={styles.metaAuthor}>{post.author}</span>
						<span className={styles.metaDot} aria-hidden="true">·</span>
						<span>{formatDate(post.publishedAt)}</span>
						<span className={styles.metaDot} aria-hidden="true">·</span>
						<span>{post.readMinutes} min read</span>
					</p>
				</header>

				{/* ── Body blocks ─────────────────────────────────────────────── */}
				<div className={styles.body}>
					{post.body.map((block, blockIdx) => (
						<section key={blockIdx} className={styles.block}>
							{block.heading && (
								<h2 className={styles.subhead}>{block.heading}</h2>
							)}
							{block.paragraphs.map((para, paraIdx) => (
								<p key={paraIdx} className={styles.paragraph}>
									{para}
								</p>
							))}
						</section>
					))}
				</div>
			</article>

			{/* ── More reading ──────────────────────────────────────────────── */}
			{moreReading.length > 0 && (
				<section className={styles.more} aria-label="More from the field guide">
					<h2 className={styles.moreTitle}>More from the field guide</h2>
					<ul className={styles.moreList}>
						{moreReading.map((p) => (
							<li key={p.slug}>
								<Link
									href={`/blog/${p.slug}`}
									className={styles.moreCard}
									style={{ "--tone": toneAccent(p.tone) } as CSSProperties}
								>
									<span className={styles.moreIcon} aria-hidden="true">
										<Icon name={toneIcon(p.tone)} size={20} aria-hidden />
									</span>
									<span className={styles.moreBody}>
										<span className={styles.moreKind}>{p.kind}</span>
										<span className={styles.moreCardTitle}>{p.title}</span>
										<span className={styles.moreMeta}>
											{p.readMinutes} min read
										</span>
									</span>
									<Icon name="action.forward" size={16} aria-hidden />
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}
