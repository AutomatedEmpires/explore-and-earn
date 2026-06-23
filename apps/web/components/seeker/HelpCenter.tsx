"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { HelpFaq, HelpItem, HelpTopicId } from "./account";
import { HELP_TOPICS } from "./account";
import { HelpPanel } from "./HelpPanel";
import styles from "./HelpCenter.module.css";

export interface HelpCenterProps {
	readonly faqs: readonly HelpFaq[];
	/** Real, tappable support links (contact, report). Rendered below the FAQ. */
	readonly items: readonly HelpItem[];
}

type TopicFilter = HelpTopicId | "all";

function normalize(value: string): string {
	return value.toLowerCase().trim();
}

/**
 * Searchable seeker help center. Client-side filtering over editorial FAQ canon
 * (no DB-backed claims), plus the real support/report links from `HelpPanel`.
 * Accordion answers are keyboard-operable and announced to assistive tech.
 */
export function HelpCenter({ faqs, items }: HelpCenterProps) {
	const [query, setQuery] = useState("");
	const [topic, setTopic] = useState<TopicFilter>("all");
	const [openId, setOpenId] = useState<string | null>(null);
	const searchId = useId();

	const results = useMemo(() => {
		const q = normalize(query);
		return faqs.filter((faq) => {
			if (topic !== "all" && faq.topic !== topic) return false;
			if (!q) return true;
			const haystack = `${faq.question} ${faq.answer.join(" ")}`.toLowerCase();
			return haystack.includes(q);
		});
	}, [faqs, query, topic]);

	const hasQuery = normalize(query).length > 0;

	return (
		<div className={styles.center}>
			<div className={styles.search}>
				<span className={styles.searchIcon} aria-hidden>
					<Icon name="action.search" size={20} aria-hidden />
				</span>
				<input
					id={searchId}
					type="search"
					className={styles.searchInput}
					placeholder="Search help — applying, housing, safety…"
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
					aria-label="Search help articles"
					autoComplete="off"
				/>
				{hasQuery ? (
					<button
						type="button"
						className={styles.clear}
						onClick={() => setQuery("")}
						aria-label="Clear search"
					>
						<Icon name="action.close" size={20} aria-hidden />
					</button>
				) : null}
			</div>

			<div
				className={styles.topics}
				role="group"
				aria-label="Filter by topic"
			>
				<button
					type="button"
					className={styles.topic}
					data-active={topic === "all"}
					aria-pressed={topic === "all"}
					onClick={() => setTopic("all")}
				>
					All topics
				</button>
				{HELP_TOPICS.map((t) => (
					<button
						key={t.id}
						type="button"
						className={styles.topic}
						data-active={topic === t.id}
						aria-pressed={topic === t.id}
						onClick={() => setTopic(t.id)}
					>
						<Icon name={t.icon} size={16} aria-hidden />
						{t.label}
					</button>
				))}
			</div>

			<p className={styles.count} role="status" aria-live="polite">
				{results.length === 0
					? "No matching answers"
					: `${results.length} ${results.length === 1 ? "answer" : "answers"}`}
			</p>

			{results.length === 0 ? (
				<div className={styles.empty}>
					<span className={styles.emptyIcon} aria-hidden>
						<Icon name="action.search" size={24} aria-hidden />
					</span>
					<p className={styles.emptyTitle}>We couldn&apos;t find that</p>
					<p className={styles.emptyDetail}>
						Try a different word, or reach the team directly below.
					</p>
				</div>
			) : (
				<ul className={styles.faqList}>
					{results.map((faq) => {
						const isOpen = openId === faq.id;
						const panelId = `${faq.id}-panel`;
						return (
							<li key={faq.id} className={styles.faq} data-open={isOpen}>
								<button
									type="button"
									className={styles.question}
									aria-expanded={isOpen}
									aria-controls={panelId}
									onClick={() => setOpenId(isOpen ? null : faq.id)}
								>
									<span className={styles.questionText}>{faq.question}</span>
									<span className={styles.chevron} aria-hidden>
										<Icon name="action.forward" size={20} aria-hidden />
									</span>
								</button>
								<div
									id={panelId}
									className={styles.answer}
									role="region"
									hidden={!isOpen}
								>
									{faq.answer.map((para, i) => (
										<p key={i} className={styles.answerText}>
											{para}
										</p>
									))}
									{faq.href ? (
										faq.href.startsWith("mailto:") ? (
											<a className={styles.answerLink} href={faq.href}>
												{faq.hrefLabel ?? "Learn more"}
												<Icon name="action.forward" size={16} aria-hidden />
											</a>
										) : (
											<Link className={styles.answerLink} href={faq.href}>
												{faq.hrefLabel ?? "Learn more"}
												<Icon name="action.forward" size={16} aria-hidden />
											</Link>
										)
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<div className={styles.support}>
				<h2 className={styles.supportTitle}>Still need a hand?</h2>
				<p className={styles.supportDetail}>
					Reach the Explore&amp;Earn team, or report anything that doesn&apos;t
					feel right.
				</p>
				<HelpPanel items={items} />
			</div>
		</div>
	);
}
