import {
	logisticsFreshness,
	type ConnectivityInfo,
} from "@explore-and-earn/contracts";

/**
 * The DECISIONS behind the "Getting online" panel, as pure data.
 *
 * Split out of ConnectivityFacts.tsx deliberately: every honesty rule on that
 * surface is a decision about WHAT MAY BE SHOWN, and those rules deserve tests.
 * The component can't be unit-tested (apps/web vitest runs `environment: node`
 * with no CSS-module resolution, so importing the .tsx fails on its stylesheet
 * import), so the rules live here — importable, pure, and covered — and the JSX
 * only maps the result.
 */

export interface ConnectivityFact {
	readonly label: string;
	readonly value: string;
}

export type ConnectivityNote =
	/** The host never dated the report — say so; unknown age isn't freshness. */
	| { readonly kind: "undated" }
	/** The report is old enough to warrant a hedge. */
	| { readonly kind: "aging" }
	| { readonly kind: "stale" }
	/** Recent enough to stand alone. */
	| null;

export interface ConnectivityFactsModel {
	/** True when the host stated "there is no internet here" — the whole answer. */
	readonly noInternet: boolean;
	/** Only facts the host actually stated. Never a "Not stated" placeholder. */
	readonly facts: readonly ConnectivityFact[];
	/** True when a speed was stated and the approximate-figure caveat applies. */
	readonly showsSpeedCaveat: boolean;
	readonly note: ConnectivityNote;
}

const CONNECTION_TYPE_LABEL: Record<string, string> = {
	fiber: "Fiber",
	cable: "Cable",
	dsl: "DSL",
	fixed_wireless: "Fixed wireless",
	satellite: "Satellite",
	cellular: "Cellular / hotspot",
};

const RELIABILITY_LABEL: Record<string, string> = {
	reliable: "Usually reliable",
	intermittent: "Drops sometimes",
	unreliable: "Often unreliable",
};

const ACCESS_LABEL: Record<string, string> = {
	private: "Private",
	shared: "Shared",
};

const COST_LABEL: Record<string, string> = {
	included: "Included",
	paid_separately: "Paid separately",
};

/** Only the places the host actually named — never a guessed "everywhere". */
export function locationsLabel(locations: readonly string[]): string | null {
	const inHousing = locations.includes("housing");
	const atWorksite = locations.includes("worksite");
	if (inHousing && atWorksite) return "In housing and at the worksite";
	if (inHousing) return "In housing";
	if (atWorksite) return "At the worksite";
	return null;
}

function noteFor(reportedAt: string | undefined, nowMs?: number): ConnectivityNote {
	const freshness = logisticsFreshness(reportedAt, nowMs);
	if (freshness === null) return { kind: "undated" };
	if (freshness === "aging") return { kind: "aging" };
	if (freshness === "stale") return { kind: "stale" };
	return null;
}

/**
 * Build the panel's facts from what the host stated — and ONLY that.
 *
 * An absent key produces no fact: the panel renders a claim only where the
 * host made one, so a seeker never reads a wall of "Not stated" cells (the
 * section itself is gated on hasLogistics upstream).
 */
export function buildConnectivityFacts(
	connectivity: ConnectivityInfo,
	nowMs?: number,
): ConnectivityFactsModel {
	const note = noteFor(connectivity.reportedAt, nowMs);

	// "No internet here" is the entire answer — every other cell would be
	// describing a connection the host says does not exist.
	if (connectivity.available === false) {
		return {
			noInternet: true,
			facts: [
				{ label: "Internet", value: "None — the host says there is no internet here" },
			],
			showsSpeedCaveat: false,
			note,
		};
	}

	const facts: ConnectivityFact[] = [];
	if (connectivity.available === true) {
		facts.push({ label: "Internet", value: "Available" });
	}
	if (connectivity.cost) {
		facts.push({ label: "Cost", value: COST_LABEL[connectivity.cost] ?? connectivity.cost });
	}
	if (connectivity.locations && connectivity.locations.length > 0) {
		const label = locationsLabel(connectivity.locations);
		if (label) facts.push({ label: "Where it works", value: label });
	}
	if (connectivity.access) {
		facts.push({ label: "Access", value: ACCESS_LABEL[connectivity.access] ?? connectivity.access });
	}
	if (connectivity.connectionType) {
		facts.push({
			label: "Connection",
			value: CONNECTION_TYPE_LABEL[connectivity.connectionType] ?? connectivity.connectionType,
		});
	}

	const speedParts = [
		connectivity.downloadMbps !== undefined ? `${connectivity.downloadMbps} down` : null,
		connectivity.uploadMbps !== undefined ? `${connectivity.uploadMbps} up` : null,
	].filter((part): part is string => part !== null);
	if (speedParts.length > 0) {
		facts.push({ label: "Approx. speed (Mbps)", value: speedParts.join(" · ") });
	}

	if (connectivity.reliability) {
		facts.push({
			label: "Reliability",
			value: RELIABILITY_LABEL[connectivity.reliability] ?? connectivity.reliability,
		});
	}
	if (connectivity.videoCallSuitable !== undefined) {
		facts.push({
			label: "Video calls",
			value: connectivity.videoCallSuitable
				? "Host says these work"
				: "Host says these don't work",
		});
	}
	if (connectivity.dataCapped !== undefined) {
		facts.push({
			label: "Data limit",
			value: connectivity.dataCapped ? "Capped" : "Unlimited",
		});
	}

	return { noInternet: false, facts, showsSpeedCaveat: speedParts.length > 0, note };
}
