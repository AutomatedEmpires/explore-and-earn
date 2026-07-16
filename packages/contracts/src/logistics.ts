// Listing logistics — the facts that decide whether an opportunity is
// realistically LIVABLE, not whether the job title sounds good.
//
// HONESTY MODEL (the reason this file is typed and closed rather than an open
// string map like BenefitDetail): every field here answers a question a seeker
// makes a relocation decision on. So each one carries exactly three possible
// states, and the type system enforces them:
//
//   * key ABSENT    → the host never stated it. Render NOT_STATED_LABEL. Never
//                     infer it, never default it, never rank or reason over it.
//                     This mirrors migrations 064's `not_stated` evidence and
//                     the claim-confirmation rule that an unconfirmed field is
//                     simply omitted from the payload (never coerced to a no).
//   * key = false   → the host explicitly said NO. Materially different from
//                     absence, and a seeker must be able to tell them apart.
//   * key = value   → the host stated it.
//
// There is deliberately no `unknown`/`not_stated` sentinel VALUE: a sentinel
// invites writing it, and a written sentinel is indistinguishable from a real
// answer at the DB level. Absence cannot be faked.
//
// Persisted in `listings.logistics` (migration 068) — ONE additive jsonb typed
// here, following the migration-040 precedent (`listings.benefit_details`)
// rather than ~20 more columns on an already-47-column table.
//
// SCOPE: this is a SEPARATE section from the Housing/Meals/Pay triad. The triad
// is product law and must never gain a fourth key (guardrail 2b); logistics
// sits beside it exactly as "Perks & benefits" does.

/* ------------------------------------------------------------ connectivity */

/**
 * How the internet physically reaches a place. Chosen because each option
 * carries a materially different lived experience (satellite latency breaks
 * video calls; cellular varies with congestion; fiber is stable).
 */
export const CONNECTION_TYPES = [
	"fiber",
	"cable",
	"dsl",
	"fixed_wireless",
	"satellite",
	"cellular",
] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

/** Where a connection is usable. A worksite-only signal is not the same offer. */
export const CONNECTIVITY_LOCATIONS = ["housing", "worksite"] as const;
export type ConnectivityLocation = (typeof CONNECTIVITY_LOCATIONS)[number];

/** Whether the connection costs the seeker anything on top of the role. */
export const CONNECTIVITY_COST = ["included", "paid_separately"] as const;
export type ConnectivityCost = (typeof CONNECTIVITY_COST)[number];

/** Shared vs private — a shared bunkhouse link behaves nothing like a private one. */
export const CONNECTIVITY_ACCESS = ["private", "shared"] as const;
export type ConnectivityAccess = (typeof CONNECTIVITY_ACCESS)[number];

/**
 * Host-reported reliability. Deliberately coarse: a host can honestly say
 * "it drops in bad weather"; they cannot honestly report an uptime percentage.
 */
export const CONNECTIVITY_RELIABILITY = ["reliable", "intermittent", "unreliable"] as const;
export type ConnectivityReliability = (typeof CONNECTIVITY_RELIABILITY)[number];

/**
 * Internet at the opportunity, as REPORTED BY THE HOST.
 *
 * Every field is optional because absence IS "Not stated" (see the honesty
 * model above). Notably `available: false` — "there is no internet here" — is a
 * real, useful, statable answer, and is why this cannot be a bare boolean chip:
 * the pre-existing `wifi` amenity chip (BenefitTrustModal) can only say
 * "Wi-Fi" or say nothing, which is precisely the "Wi-Fi available" claim that
 * must never imply reliable high-speed service everywhere onsite.
 */
export interface ConnectivityInfo {
	/** Is there internet at all? Absent = not stated; false = explicitly none. */
	readonly available?: boolean;
	/** Included in the role, or an extra cost to the seeker. */
	readonly cost?: ConnectivityCost;
	/** Where it actually works. Empty/absent = not stated. */
	readonly locations?: readonly ConnectivityLocation[];
	readonly access?: ConnectivityAccess;
	readonly connectionType?: ConnectionType;
	/**
	 * APPROXIMATE megabits/sec as the host experiences it — never presented as
	 * a guarantee or a measurement. Non-finite/negative values are rejected at
	 * the boundary (see sanitizeConnectivity).
	 */
	readonly downloadMbps?: number;
	readonly uploadMbps?: number;
	readonly reliability?: ConnectivityReliability;
	/** True = a data cap applies. Absent = not stated. */
	readonly dataCapped?: boolean;
	/**
	 * Whether the host says video calls actually work. This is the question
	 * remote seekers are really asking, and it is NOT derivable from speed
	 * alone (satellite can be fast and still unusable for calls) — so it is
	 * stated, never computed.
	 */
	readonly videoCallSuitable?: boolean;
	/**
	 * ISO date the host last confirmed this. Connectivity rots (a tower goes in,
	 * a line gets cut), so a stated-but-ancient report must be surfaceable as
	 * stale rather than presented as current truth.
	 */
	readonly reportedAt?: string;
}

/** The `listings.logistics` JSONB shape (migration 068). */
export interface ListingLogistics {
	readonly connectivity?: ConnectivityInfo;
}

/* --------------------------------------------------------------- staleness */

/** A host-reported logistics fact is shown as aging past this many days. */
export const LOGISTICS_AGING_DAYS = 180;
/** …and as stale past this many. Mirrors the sourced-freshness policy shape. */
export const LOGISTICS_STALE_DAYS = 365;

export const LOGISTICS_FRESHNESS = ["fresh", "aging", "stale"] as const;
export type LogisticsFreshness = (typeof LOGISTICS_FRESHNESS)[number];

/**
 * Freshness of a host report, DERIVED at read time (never stored — a stored
 * freshness would be wrong the moment it was written). Returns null when the
 * host never dated the report: unknown age is not the same as fresh.
 */
export function logisticsFreshness(
	reportedAt: string | null | undefined,
	nowMs: number = Date.now(),
): LogisticsFreshness | null {
	if (!reportedAt) return null;
	const reported = Date.parse(reportedAt);
	if (!Number.isFinite(reported)) return null;
	const ageDays = (nowMs - reported) / 86_400_000;
	if (ageDays < 0) return null; // a future date is not a report
	if (ageDays >= LOGISTICS_STALE_DAYS) return "stale";
	if (ageDays >= LOGISTICS_AGING_DAYS) return "aging";
	return "fresh";
}

/* -------------------------------------------------------------- boundaries */

/** Plausible ceiling for a host-reported speed — beyond this it is a typo. */
const MAX_PLAUSIBLE_MBPS = 10_000;

function optionalMbps(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	if (value <= 0 || value > MAX_PLAUSIBLE_MBPS) return undefined;
	// One decimal is as precise as an honest self-report gets.
	return Math.round(value * 10) / 10;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function optionalMember<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | undefined {
	return typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/**
 * Coerce untrusted input (host form, persisted jsonb, a source import) into a
 * ConnectivityInfo, DROPPING every key it cannot vouch for.
 *
 * Dropping is the honest failure mode: an unparseable value becomes absence,
 * which renders "Not stated" — never a guess, never a default. Returns
 * undefined when nothing survived, so an empty object is never persisted as if
 * the host had answered.
 */
export function sanitizeConnectivity(value: unknown): ConnectivityInfo | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const v = value as Record<string, unknown>;

	const locations = Array.isArray(v.locations)
		? [...new Set(v.locations)].filter((l): l is ConnectivityLocation =>
				(CONNECTIVITY_LOCATIONS as readonly unknown[]).includes(l),
			)
		: undefined;

	const out: Record<string, unknown> = {};
	const available = optionalBoolean(v.available);
	if (available !== undefined) out.available = available;

	// Everything below DESCRIBES a connection, so it is incoherent when the
	// host has explicitly said there is none. Dropping it here means a listing
	// can never claim "no internet" and "50 Mbps" at once.
	if (available !== false) {
		const cost = optionalMember(v.cost, CONNECTIVITY_COST);
		if (cost) out.cost = cost;
		if (locations && locations.length > 0) out.locations = locations;
		const access = optionalMember(v.access, CONNECTIVITY_ACCESS);
		if (access) out.access = access;
		const connectionType = optionalMember(v.connectionType, CONNECTION_TYPES);
		if (connectionType) out.connectionType = connectionType;
		const downloadMbps = optionalMbps(v.downloadMbps);
		if (downloadMbps !== undefined) out.downloadMbps = downloadMbps;
		const uploadMbps = optionalMbps(v.uploadMbps);
		if (uploadMbps !== undefined) out.uploadMbps = uploadMbps;
		const reliability = optionalMember(v.reliability, CONNECTIVITY_RELIABILITY);
		if (reliability) out.reliability = reliability;
		const dataCapped = optionalBoolean(v.dataCapped);
		if (dataCapped !== undefined) out.dataCapped = dataCapped;
		const videoCallSuitable = optionalBoolean(v.videoCallSuitable);
		if (videoCallSuitable !== undefined) out.videoCallSuitable = videoCallSuitable;
	}

	const reportedAt = optionalIsoDate(v.reportedAt);
	if (reportedAt) out.reportedAt = reportedAt;

	// A report that says nothing but when it was made says nothing.
	const stated = Object.keys(out).filter((k) => k !== "reportedAt");
	if (stated.length === 0) return undefined;
	return out as ConnectivityInfo;
}

/** Coerce untrusted input into the persisted `listings.logistics` shape. */
export function sanitizeLogistics(value: unknown): ListingLogistics {
	if (typeof value !== "object" || value === null) return {};
	const connectivity = sanitizeConnectivity(
		(value as Record<string, unknown>).connectivity,
	);
	return connectivity ? { connectivity } : {};
}

/** True when the host stated anything at all — gates the whole section. */
export function hasLogistics(logistics: ListingLogistics | null | undefined): boolean {
	if (!logistics?.connectivity) return false;
	return Object.keys(logistics.connectivity).some((k) => k !== "reportedAt");
}
