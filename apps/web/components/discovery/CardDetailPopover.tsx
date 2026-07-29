"use client";

import {
	MATCH_COMPONENT_LABELS,
	MATCH_SCORE_WEIGHTS,
	formatDate,
	formatSeasonLength,
	type MatchScoreComponent,
} from "@explore-and-earn/contracts";
import { Icon, Meter } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import type { DiscoveryListing } from "./listing";
import styles from "./CardDetailPopover.module.css";

/**
 * CardDetailPopover — the three card explainers that had nowhere to live.
 *
 * Housing, Meals, Pay, the host and the report flag all already open a real
 * dialog from the card. Three other assertions did not: the DATES strip, the
 * VERIFIED badge, and the MATCH pill. Each of those is a claim the card makes
 * in four words or a two-digit number, and a seeker had no way to ask any of
 * them what they meant.
 *
 * All three are rendered through the SAME PopupShell the existing drawers use,
 * which is what makes them keyboard- and screen-reader-operable by
 * construction: focus moves in, Tab cycles inside, Escape closes, focus returns
 * to the control that opened it, and everything outside is aria-hidden while it
 * is open. There is deliberately NO hover-triggered variant — a tooltip that
 * only appears on hover is unreachable on a phone and invisible to a screen
 * reader, and these are decision inputs, not decoration.
 *
 * HONESTY. Every panel below renders stored values or says the value is
 * missing. The match panel in particular explains a stored score from stored
 * component numbers; when the engine has not scored the pairing, it says so
 * rather than showing an empty breakdown that reads like a zero.
 */

export type CardDetailKind = "dates" | "verification" | "match";

export interface CardDetailPopoverProps {
	readonly listing: DiscoveryListing | null;
	readonly kind: CardDetailKind | null;
	readonly onClose: () => void;
}

const TITLE: Record<CardDetailKind, string> = {
	dates: "Season & timing",
	verification: "What “Verified Host” means",
	match: "Why this matched you",
};

const HEADER_ICON: Record<CardDetailKind, Parameters<typeof Icon>[0]["name"]> = {
	dates: "status.begins",
	verification: "trust.verified_host",
	match: "status.match",
};

/** A long ISO date, or null when the listing carries no such date. */
function longDate(iso: string | undefined): string | null {
	if (!iso) return null;
	const parsed = Date.parse(iso);
	if (Number.isNaN(parsed)) return null;
	return formatDate(iso, { month: "long", day: "numeric", year: "numeric" });
}

function Row({
	label,
	value,
	missing,
}: {
	readonly label: string;
	readonly value: string | null;
	/** What to say when the value is absent. Never a dash, never a zero. */
	readonly missing: string;
}) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<span className={value ? styles.rowValue : styles.rowMissing}>
				{value ?? missing}
			</span>
		</div>
	);
}

function DatesPanel({ listing }: { readonly listing: DiscoveryListing }) {
	const begins = longDate(listing.begins);
	const ends = longDate(listing.ends);
	const length = formatSeasonLength(listing.begins, listing.ends);
	const closes = longDate(listing.expiresAt);

	return (
		<div className={styles.panel}>
			<Row label="Begins" value={begins} missing="The host hasn't given a start date" />
			<Row label="Ends" value={ends} missing="The host hasn't given an end date" />
			<Row
				label="Season length"
				value={length}
				missing="Can't be worked out without both dates"
			/>
			<Row
				label="Host's own words"
				value={listing.opportunityWindow || null}
				missing="No timing note"
			/>
			<Row
				label="Listing closes"
				value={closes}
				missing="No close date set"
			/>
			<p className={styles.note}>
				<Icon name="system.info" size={16} aria-hidden />
				<span>
					“Listing closes” is when this posting stops being live — it is not an
					application deadline, and the host has not published one.
				</span>
			</p>
		</div>
	);
}

function VerificationPanel({ listing }: { readonly listing: DiscoveryListing }) {
	const sourced = listing.provenanceInfo?.provenance === "sourced";
	const verified = listing.host.verified && !sourced;

	return (
		<div className={styles.panel}>
			<p className={styles.lead}>
				{sourced
					? "This listing was sourced from a public posting. Explore & Earn has not confirmed it with the employer, and it carries no verification."
					: verified
						? "This host holds an active paid Explore & Earn plan. The badge is granted automatically from that plan — it is never self-declared and never switched on by an administrator."
						: "This host does not currently carry the Verified Host badge."}
			</p>
			<ul className={styles.list}>
				<li className={styles.listYes}>
					<Icon name="system.success" size={16} aria-hidden />
					Says: the account behind this listing is a paying, identified host.
				</li>
				<li className={styles.listNo}>
					<Icon name="action.close" size={16} aria-hidden />
					Does NOT say: that the housing, meals, pay or property have been
					inspected by anyone.
				</li>
				<li className={styles.listNo}>
					<Icon name="action.close" size={16} aria-hidden />
					Does NOT say: that Explore &amp; Earn endorses this employer.
				</li>
			</ul>
			<p className={styles.note}>
				<Icon name="system.info" size={16} aria-hidden />
				<span>
					Housing, meals and pay are the host&rsquo;s own statements. Open each
					one on the card to see exactly what they said, and what they left
					unanswered.
				</span>
			</p>
		</div>
	);
}

function MatchPanel({ listing }: { readonly listing: DiscoveryListing }) {
	const reasons = listing.matchReasons ?? [];
	const score = listing.matchScore;
	const confidence = listing.matchConfidence;

	if (typeof score !== "number") {
		return (
			<div className={styles.panel}>
				<p className={styles.lead}>
					This opportunity hasn&rsquo;t been scored against your profile yet, so
					there is nothing to explain. Filling in more of your résumé is what
					gives the match engine something to work with.
				</p>
			</div>
		);
	}

	return (
		<div className={styles.panel}>
			<Meter value={score} label="Match" />
			{reasons.length > 0 ? (
				<>
					<p className={styles.lead}>
						The score is a weighted blend of six axes. These carried it:
					</p>
					<ul className={styles.list}>
						{reasons.map((reason) => (
							<li key={reason.component} className={styles.listYes}>
								<Icon name="system.success" size={16} aria-hidden />
								<span>
									<strong>{reason.label}</strong>
									{" — "}
									{Math.round(
										(MATCH_SCORE_WEIGHTS[reason.component as MatchScoreComponent] ??
											0) * 100,
									)}
									% of the total score
								</span>
							</li>
						))}
					</ul>
				</>
			) : (
				<p className={styles.lead}>
					No single axis stood out strongly enough to name. The score comes from
					the blend rather than from one strong signal.
				</p>
			)}
			{typeof confidence === "number" ? (
				<p className={confidence < 55 ? styles.warn : styles.note}>
					<Icon name="system.info" size={16} aria-hidden />
					<span>
						Confidence {confidence}%
						{confidence < 55
							? " — parts of your profile or this listing are still blank, so treat the score as provisional."
							: " — how much real data this score had to work with."}
					</span>
				</p>
			) : null}
			<p className={styles.note}>
				<Icon name="system.info" size={16} aria-hidden />
				<span>
					Axes considered: {Object.values(MATCH_COMPONENT_LABELS).join(", ")}.
				</span>
			</p>
		</div>
	);
}

export function CardDetailPopover({ listing, kind, onClose }: CardDetailPopoverProps) {
	const open = Boolean(listing && kind);
	if (!listing || !kind) {
		return null;
	}

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title={TITLE[kind]}
			eyebrow={listing.title}
			headerIcon={<Icon name={HEADER_ICON[kind]} size={24} aria-hidden />}
			size="compact"
		>
			{kind === "dates" ? <DatesPanel listing={listing} /> : null}
			{kind === "verification" ? <VerificationPanel listing={listing} /> : null}
			{kind === "match" ? <MatchPanel listing={listing} /> : null}
		</PopupShell>
	);
}
