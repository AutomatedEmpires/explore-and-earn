import { Icon } from "@explore-and-earn/ui";
import type { MaritimeDepth } from "@explore-and-earn/contracts";

import { ListingSection } from "./ListingSection";
import { buildMaritimeFacts, type MaritimeNote } from "./maritimeFactsModel";
// Reuses the glance grid verbatim — a fact cell here IS a glance cell, and
// sharing the stylesheet keeps the two from drifting apart (and adds no new
// module for the design ratchets to police).
import styles from "./ListingGlance.module.css";

/**
 * "The vessel" — the host's own answers about the boat and the berth.
 *
 * WHY IT EXISTS: for a maritime role the vessel IS the workplace and usually
 * the home, and "do I sleep aboard?" silently decides whether a seeker must
 * find and pay for housing in a marina town. Nothing else on the listing
 * answers it, and it is not inferable from the job title.
 *
 * Every honesty decision lives in ./maritimeFactsModel (pure + tested): only
 * stated facts become cells, an explicit "no, you don't sleep aboard" is
 * preserved rather than collapsed into silence, the length is labelled
 * approximate, and an old or undated report is labelled rather than passed off
 * as current. This file only renders.
 *
 * The caller gates on hasCategoryDepth(), so this never renders an empty claim.
 */

export interface MaritimeFactsProps {
	readonly maritime: MaritimeDepth;
	/** Injected so the server render (and its tests) are deterministic. */
	readonly nowMs?: number;
}

export function MaritimeFacts({ maritime, nowMs }: MaritimeFactsProps) {
	const model = buildMaritimeFacts(maritime, nowMs);

	return (
		<ListingSection
			title="The vessel"
			icon="category.maritime"
			headingId="listing-maritime"
			subtitle="What the host says about the boat and your berth — their report, not a survey."
		>
			<div className={styles.grid}>
				{model.facts.map((fact) => (
					<div key={fact.label} className={styles.cell}>
						<p className={styles.label}>{fact.label}</p>
						<p className={styles.value}>{fact.value}</p>
					</div>
				))}
			</div>
			{model.showsLengthCaveat ? (
				<p className={styles.note}>
					Length is the host&rsquo;s approximate figure — not a measured or registered
					dimension.
				</p>
			) : null}
			<FreshnessNote note={model.note} />
		</ListingSection>
	);
}

function FreshnessNote({ note }: { readonly note: MaritimeNote }) {
	if (note === null) return null;
	const text =
		note.kind === "undated"
			? "The host didn’t date this report, so how current it is isn’t known."
			: note.kind === "aging"
				? "This was last confirmed a while ago — worth asking the host to check."
				: "This report is over a year old. Ask the host to confirm before you rely on it.";
	return (
		<p className={styles.note}>
			<Icon name="system.info" size={14} aria-hidden /> {text}
		</p>
	);
}
