import {
	categoryDepthFreshness,
	type BerthType,
	type MaritimeDepth,
	type VesselType,
} from "@explore-and-earn/contracts";

/**
 * The DECISIONS behind the "The vessel" panel, as pure data.
 *
 * Split out of MaritimeFacts.tsx for the same reason connectivityFactsModel
 * exists: every rule on this surface is a decision about WHAT MAY BE SHOWN, and
 * those rules deserve tests. The component cannot be unit-tested (apps/web
 * vitest runs `environment: node` with no CSS-module resolution, so importing
 * the .tsx dies on its stylesheet import), so the rules live here — importable,
 * pure, covered — and the JSX only maps the result.
 */

export interface MaritimeFact {
	readonly label: string;
	readonly value: string;
}

export type MaritimeNote =
	/** The host never dated the report — say so; unknown age isn't freshness. */
	| { readonly kind: "undated" }
	| { readonly kind: "aging" }
	| { readonly kind: "stale" }
	/** Recent enough to stand alone. */
	| null;

export interface MaritimeFactsModel {
	/** Only facts the host actually stated. Never a "Not stated" placeholder. */
	readonly facts: readonly MaritimeFact[];
	/** True when a length was stated and the approximate-figure caveat applies. */
	readonly showsLengthCaveat: boolean;
	readonly note: MaritimeNote;
}

const VESSEL_TYPE_LABEL: Record<VesselType, string> = {
	sailing_yacht: "Sailing yacht",
	motor_yacht: "Motor yacht",
	tall_ship: "Tall ship",
	fishing_vessel: "Fishing vessel",
	charter_boat: "Charter boat",
	workboat: "Workboat",
	liveaboard: "Liveaboard",
};

const BERTH_TYPE_LABEL: Record<BerthType, string> = {
	private_cabin: "Private cabin",
	shared_cabin: "Shared cabin",
	bunk_shared: "Bunk in shared quarters",
};

function noteFor(reportedAt: string | undefined, nowMs?: number): MaritimeNote {
	const freshness = categoryDepthFreshness(reportedAt, nowMs);
	if (freshness === null) return { kind: "undated" };
	if (freshness === "aging") return { kind: "aging" };
	if (freshness === "stale") return { kind: "stale" };
	return null;
}

/**
 * Build the panel's facts from what the host stated — and ONLY that.
 *
 * An absent key produces no fact: the panel renders a claim only where the host
 * made one, so a seeker never reads a wall of "Not stated" cells (the section
 * itself is gated on hasCategoryDepth upstream).
 *
 * Note there is no "no vessel" short-circuit here, unlike connectivity's "no
 * internet". `berthAboard: false` does NOT collapse the other facts: not
 * sleeping aboard says nothing about how long the boat is or how many crew are
 * on it. The contract drops only the one fact that genuinely contradicts it
 * (berth privacy). Copying slice 1's collapse here would hide facts the host
 * really did state.
 */
export function buildMaritimeFacts(
	maritime: MaritimeDepth,
	nowMs?: number,
): MaritimeFactsModel {
	const facts: MaritimeFact[] = [];

	if (maritime.vesselType) {
		facts.push({ label: "Vessel", value: VESSEL_TYPE_LABEL[maritime.vesselType] });
	}
	if (maritime.lengthFeet !== undefined) {
		facts.push({ label: "Approx. length", value: `${maritime.lengthFeet} ft` });
	}
	// `!== undefined`, never truthiness: `false` here is the host answering "no,
	// you don't sleep aboard" — a fact that decides whether a seeker must find
	// and pay for housing ashore. Collapsing it into silence would erase the
	// most decision-changing answer on this panel.
	if (maritime.berthAboard !== undefined) {
		facts.push({
			label: "Sleep aboard",
			value: maritime.berthAboard
				? "Yes — you berth on the vessel"
				: "No — you arrange your own housing ashore",
		});
	}
	if (maritime.berthType) {
		facts.push({ label: "Your berth", value: BERTH_TYPE_LABEL[maritime.berthType] });
	}
	if (maritime.crewSize !== undefined) {
		facts.push({
			label: "Crew aboard",
			value: maritime.crewSize === 1 ? "1 (solo)" : `${maritime.crewSize} including you`,
		});
	}

	return {
		facts,
		showsLengthCaveat: maritime.lengthFeet !== undefined,
		note: noteFor(maritime.reportedAt, nowMs),
	};
}
