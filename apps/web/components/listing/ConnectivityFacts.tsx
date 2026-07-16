import { Icon } from "@explore-and-earn/ui";
import type { ConnectivityInfo } from "@explore-and-earn/contracts";

import { ListingSection } from "./ListingSection";
import {
	buildConnectivityFacts,
	type ConnectivityNote,
} from "./connectivityFactsModel";
// Reuses the glance grid verbatim — a fact cell here IS a glance cell, and
// sharing the stylesheet keeps the two from drifting apart (and adds no new
// module for the design ratchets to police).
import styles from "./ListingGlance.module.css";

/**
 * "Getting online" — the host's own answers about internet at the opportunity.
 *
 * WHY IT EXISTS: for a remote role, a barn, a bunkhouse, or a vessel this is
 * often the fact that decides whether someone can take the job at all — and
 * the only signal before this was a bare "Wi-Fi" amenity chip that could say
 * "Wi-Fi" or say nothing.
 *
 * Every honesty decision lives in ./connectivityFactsModel (pure + tested):
 * only stated facts become cells, "no internet" is the whole answer when the
 * host says so, speeds are labelled approximate, and an old or undated report
 * is labelled rather than passed off as current. This file only renders.
 *
 * The caller gates on hasLogistics(), so this never renders an empty claim.
 */

export interface ConnectivityFactsProps {
	readonly connectivity: ConnectivityInfo;
	/** Injected so the server render (and its tests) are deterministic. */
	readonly nowMs?: number;
}

export function ConnectivityFacts({ connectivity, nowMs }: ConnectivityFactsProps) {
	const model = buildConnectivityFacts(connectivity, nowMs);

	return (
		<ListingSection
			title="Getting online"
			icon="benefit.wifi"
			headingId="listing-connectivity"
			subtitle={
				model.noInternet
					? "What the host says about internet here."
					: "What the host says about internet here — their report, not a measurement."
			}
		>
			<div className={styles.grid}>
				{model.facts.map((fact) => (
					<div key={fact.label} className={styles.cell}>
						<p className={styles.label}>{fact.label}</p>
						<p className={styles.value}>{fact.value}</p>
					</div>
				))}
			</div>
			{model.showsSpeedCaveat ? (
				<p className={styles.label}>
					Speeds are the host&rsquo;s approximate figures — not a guaranteed or measured
					rate.
				</p>
			) : null}
			<FreshnessNote note={model.note} />
		</ListingSection>
	);
}

function FreshnessNote({ note }: { readonly note: ConnectivityNote }) {
	if (note === null) return null;
	const text =
		note.kind === "undated"
			? "The host didn’t date this report, so how current it is isn’t known."
			: note.kind === "aging"
				? "This was last confirmed a while ago — worth asking the host to check."
				: "This report is over a year old. Ask the host to confirm before you rely on it.";
	return (
		<p className={styles.label}>
			<Icon name="system.info" size={14} aria-hidden /> {text}
		</p>
	);
}
