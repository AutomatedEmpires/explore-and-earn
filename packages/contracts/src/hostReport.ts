/**
 * Shared internals for host-STATED fact groups (logistics, category depth, …).
 *
 * INTERNAL TO THIS PACKAGE — deliberately not re-exported from index.ts. These
 * are the mechanics behind the contracts, not part of the public surface; each
 * fact group exports its own named, documented API.
 *
 * Everything here exists to serve one rule: a fact the host never stated has no
 * key. There is no sentinel value, because a written sentinel is
 * indistinguishable from a real answer once it is in the column. So every
 * coercion below DROPS what it cannot vouch for — an unparseable value becomes
 * absence, which renders "Not stated", rather than a guess or a default.
 */

/* ------------------------------------------------------------- coercion */

export function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

export function optionalMember<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | undefined {
	return typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

export function optionalIsoDate(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/**
 * A positive measurement, or nothing.
 *
 * Out-of-range values DROP rather than clamp: clamping would invent a number
 * the host never said and present it as their answer. Zero and negatives are
 * not measurements — a host meaning "none" has an explicit way to say so.
 */
export function optionalPositiveNumber(
	value: unknown,
	max: number,
	decimals = 0,
): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	if (value <= 0 || value > max) return undefined;
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/** A whole count (crew, berths). Fractional input is not a count — it drops. */
export function optionalPositiveInteger(value: unknown, max: number): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	if (!Number.isInteger(value)) return undefined;
	if (value <= 0 || value > max) return undefined;
	return value;
}

/* ------------------------------------------------------------ freshness */

/**
 * A host-stated fact is shown as aging past this many days…
 *
 * These live here, not in one fact group, because the policy is about how long
 * ANY self-report stays credible — not about internet or boats. Two copies
 * would be two chances to drift on an honesty rule.
 */
export const HOST_REPORT_AGING_DAYS = 180;
/** …and as stale past this many. Mirrors the sourced-freshness policy shape. */
export const HOST_REPORT_STALE_DAYS = 365;

export const HOST_REPORT_FRESHNESS = ["fresh", "aging", "stale"] as const;
export type HostReportFreshness = (typeof HOST_REPORT_FRESHNESS)[number];

/**
 * Freshness of a host report, DERIVED at read time.
 *
 * Never stored: a stored freshness would be wrong the moment it was written.
 * Returns null when the host never dated the report — unknown age is not the
 * same as fresh, and must be surfaced as unknown rather than assumed current.
 */
export function hostReportFreshness(
	reportedAt: string | null | undefined,
	nowMs: number = Date.now(),
): HostReportFreshness | null {
	if (!reportedAt) return null;
	const reported = Date.parse(reportedAt);
	if (!Number.isFinite(reported)) return null;
	const ageDays = (nowMs - reported) / 86_400_000;
	if (ageDays < 0) return null; // a future date is not a report
	if (ageDays >= HOST_REPORT_STALE_DAYS) return "stale";
	if (ageDays >= HOST_REPORT_AGING_DAYS) return "aging";
	return "fresh";
}

/**
 * The stated facts of a report, ignoring its date, as a stable comparison key.
 *
 * This is what "did the host change their answer?" means: a writer stamps a
 * fresh `reportedAt` only when this string changes. Re-stamping on every save
 * would claim "the host confirmed this today" whenever they edited something
 * unrelated — turning the freshness signal into the lie it exists to expose.
 *
 * Keys are sorted so that serialization order can never masquerade as a change.
 */
export function statedFactsKey(info: object | undefined): string {
	return JSON.stringify(
		Object.entries(info ?? {})
			.filter(([key]) => key !== "reportedAt")
			.sort(([a], [b]) => a.localeCompare(b)),
	);
}
