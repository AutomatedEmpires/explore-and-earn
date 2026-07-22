/**
 * Source ingestion engine — the PURE core of the honest listing-sourcing
 * pipeline (founder charter 2026-07-14, provenance lane).
 *
 * Everything here is deterministic and I/O-free: payload parsing (CSV/JSON),
 * stated-only field extraction, conservative normalization, four-category
 * classification, content fingerprinting, and dedup planning. The query layer
 * (queries/sourcedListings.ts) supplies inventory and executes plans; this
 * module NEVER invents a fact:
 *
 *  - a field the source did not state is ABSENT (benefits: 'not_stated');
 *  - pay is normalized to cents only when the source provides clean numbers —
 *    otherwise the source's own pay text is kept verbatim as the summary;
 *  - classification is deterministic keyword/config mapping; anything
 *    ambiguous is flagged for founder review, never silently misclassified;
 *  - dedup is conservative: a probable duplicate is flagged for review, never
 *    auto-merged, and verified inventory is never touched.
 */

import { createHash } from "node:crypto"

/* ---------------------------------------------------------------- payloads */

/** One raw record from a source payload, keyed by the source's own headers. */
export type RawSourceRecord = Readonly<Record<string, string>>

/**
 * Minimal, dependency-free CSV parser: quoted fields, escaped quotes (""),
 * commas and newlines inside quotes, CRLF tolerance. First row is the header.
 * Deterministic and strict — a structurally broken payload throws (the caller
 * records the import as failed rather than half-ingesting).
 */
export function parseCsv(text: string): RawSourceRecord[] {
	const rows: string[][] = []
	let field = ""
	let row: string[] = []
	let inQuotes = false

	for (let i = 0; i < text.length; i++) {
		const ch = text[i]
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i++
				} else {
					inQuotes = false
				}
			} else {
				field += ch
			}
		} else if (ch === '"') {
			inQuotes = true
		} else if (ch === ",") {
			row.push(field)
			field = ""
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++
			row.push(field)
			field = ""
			rows.push(row)
			row = []
		} else {
			field += ch
		}
	}
	if (inQuotes) throw new Error("csv: unterminated quoted field")
	if (field.length > 0 || row.length > 0) {
		row.push(field)
		rows.push(row)
	}

	const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""))
	if (nonEmpty.length < 2) return []
	const headers = nonEmpty[0].map((h) => h.trim())
	return nonEmpty.slice(1).map((cells) => {
		const record: Record<string, string> = {}
		headers.forEach((header, index) => {
			if (header) record[header] = (cells[index] ?? "").trim()
		})
		return record
	})
}

/** Parse a JSON payload: an array of flat records, or { records: [...] }. */
export function parseJsonRecords(text: string): RawSourceRecord[] {
	const parsed: unknown = JSON.parse(text)
	const list = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).records)
			? ((parsed as Record<string, unknown>).records as unknown[])
			: null
	if (!list) throw new Error("json: expected an array of records or { records: [...] }")
	return list.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error("json: every record must be an object")
		}
		const record: Record<string, string> = {}
		for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
			if (value === null || value === undefined) continue
			if (typeof value === "string") record[key] = value.trim()
			else if (typeof value === "number" || typeof value === "boolean") record[key] = String(value)
			// nested objects/arrays are ignored — mappings address flat fields only
		}
		return record
	})
}

/* ----------------------------------------------------------- source config */

/**
 * Declarative field mapping stored on listing_sources.config — which payload
 * keys carry which listing facts. Every entry is OPTIONAL: an unmapped or
 * empty field is simply not stated. Validated by validateSourceConfig().
 */
export interface SourceFieldMapping {
	readonly title?: string
	readonly description?: string
	readonly employerName?: string
	readonly externalId?: string
	readonly url?: string
	readonly location?: string
	readonly latitude?: string
	readonly longitude?: string
	/** Column carrying an explicit housing statement (yes/no vocabulary). */
	readonly housing?: string
	readonly housingDetails?: string
	readonly meals?: string
	readonly mealsDetails?: string
	/** Freeform pay text (kept verbatim as the pay summary). */
	readonly payText?: string
	/** Clean numeric pay columns (whole currency units) + unit column. */
	readonly payMin?: string
	readonly payMax?: string
	readonly payUnit?: string
	readonly beginsAt?: string
	readonly endsAt?: string
	readonly expiresAt?: string
	readonly publishedAt?: string
	/** Source's own category column, translated via categoryMap. */
	readonly category?: string
	/** sourceValue (lowercased) → platform category. */
	readonly categoryMap?: Readonly<Record<string, PlatformCategory>>
}

export function validateSourceConfig(config: unknown): {
	ok: boolean
	mapping: SourceFieldMapping
	errors: string[]
} {
	const errors: string[] = []
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return { ok: false, mapping: {}, errors: ["config must be an object"] }
	}
	const raw = config as Record<string, unknown>
	const mapping = (raw.mapping ?? raw) as Record<string, unknown>
	const out: Record<string, unknown> = {}
	const stringKeys = [
		"title", "description", "employerName", "externalId", "url", "location",
		"latitude", "longitude", "housing", "housingDetails", "meals", "mealsDetails",
		"payText", "payMin", "payMax", "payUnit", "beginsAt", "endsAt", "expiresAt",
		"publishedAt", "category",
	] as const
	for (const key of stringKeys) {
		const value = mapping[key]
		if (value === undefined) continue
		if (typeof value !== "string" || value.trim() === "") {
			errors.push(`mapping.${key} must be a non-empty string`)
		} else {
			out[key] = value.trim()
		}
	}
	if (mapping.categoryMap !== undefined) {
		const cm = mapping.categoryMap
		if (!cm || typeof cm !== "object" || Array.isArray(cm)) {
			errors.push("mapping.categoryMap must be an object")
		} else {
			const cleaned: Record<string, PlatformCategory> = {}
			for (const [key, value] of Object.entries(cm as Record<string, unknown>)) {
				if (PLATFORM_CATEGORIES.includes(value as PlatformCategory)) {
					cleaned[key.trim().toLowerCase()] = value as PlatformCategory
				} else {
					errors.push(`mapping.categoryMap["${key}"] must be one of ${PLATFORM_CATEGORIES.join("|")}`)
				}
			}
			out.categoryMap = cleaned
		}
	}
	if (!out.title) errors.push("mapping.title is required")
	if (!out.externalId && !out.url) {
		errors.push("mapping must include externalId or url (attribution + dedup anchor)")
	}
	return { ok: errors.length === 0, mapping: out as SourceFieldMapping, errors }
}

/* ------------------------------------------------------------ normalization */

/** Explicit benefit statement parsed from a source value — never defaulted. */
export type StatedBenefit =
	| { readonly status: "stated"; readonly value: boolean }
	| { readonly status: "not_stated" }

const YES_TOKENS = new Set([
	"yes", "true", "y", "1", "included", "provided", "available", "housing provided",
	"meals provided", "free housing", "free meals", "on-site housing",
])
const NO_TOKENS = new Set([
	"no", "false", "n", "0", "not included", "not provided", "none", "unavailable",
	"no housing", "no meals",
])

/**
 * Parse an explicit yes/no statement. Anything outside the known vocabulary —
 * including blank, "unknown", "ask", or free text — is NOT STATED. Absence of
 * information is never evidence of absence of the benefit.
 */
export function parseStatedBenefit(value: string | undefined): StatedBenefit {
	const normalized = value?.trim().toLowerCase() ?? ""
	if (normalized === "") return { status: "not_stated" }
	if (YES_TOKENS.has(normalized)) return { status: "stated", value: true }
	if (NO_TOKENS.has(normalized)) return { status: "stated", value: false }
	return { status: "not_stated" }
}

const PAY_UNITS = new Set(["hour", "day", "week", "month", "year", "stipend", "exchange", "other"])

/** Strict money parse: plain number or "18.50"/"$18.50"/"1,200". Whole units → cents. */
function parseMoneyToCents(value: string | undefined): number | null {
	if (!value) return null
	const cleaned = value.replace(/[$,\s]/g, "")
	if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
	const cents = Math.round(Number(cleaned) * 100)
	return Number.isFinite(cents) && cents >= 0 ? cents : null
}

/** Strict ISO-ish date parse → ISO string, or null (never guessed). */
function parseIsoDate(value: string | undefined): string | null {
	if (!value) return null
	const trimmed = value.trim()
	if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null
	const ms = Date.parse(trimmed)
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function parseCoordinate(value: string | undefined, min: number, max: number): number | null {
	const normalized = value?.trim()
	if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null
	const parsed = Number(normalized)
	return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

/** The staging representation: stated facts ONLY, plus evidence status. */
export interface NormalizedSourceRecord {
	readonly title: string
	readonly description: string | null
	readonly employerName: string | null
	readonly externalId: string | null
	readonly sourceUrl: string | null
	readonly location: string | null
	readonly latitude: number | null
	readonly longitude: number | null
	readonly housing: StatedBenefit
	readonly housingDetails: string | null
	readonly meals: StatedBenefit
	readonly mealsDetails: string | null
	/** Verbatim source pay text (compensation summary), when stated. */
	readonly payText: string | null
	/** Cents — ONLY when the source provided clean numbers. */
	readonly payMinCents: number | null
	readonly payMaxCents: number | null
	readonly payUnit: string | null
	readonly beginsAt: string | null
	readonly endsAt: string | null
	readonly expiresAt: string | null
	readonly publishedAt: string | null
	/** The source's own category value (pre-classification), lowercased. */
	readonly sourceCategoryValue: string | null
}

export type NormalizeResult =
	| { readonly ok: true; readonly record: NormalizedSourceRecord }
	| { readonly ok: false; readonly reason: string }

const text = (value: string | undefined): string | null => {
	const trimmed = value?.trim() ?? ""
	return trimmed === "" ? null : trimmed
}

/** Extract exactly what the source stated, per the mapping. Nothing else. */
export function normalizeRecord(
	raw: RawSourceRecord,
	mapping: SourceFieldMapping,
): NormalizeResult {
	const pick = (key: keyof SourceFieldMapping): string | undefined => {
		const column = mapping[key]
		return typeof column === "string" ? raw[column] : undefined
	}

	const title = text(pick("title"))
	if (!title) return { ok: false, reason: "missing_title" }

	const externalId = text(pick("externalId"))
	const sourceUrl = canonicalizeSourceUrl(text(pick("url")))
	if (!externalId && !sourceUrl) {
		return { ok: false, reason: "missing_identity" } // no attribution/dedup anchor
	}

	const payMinCents = parseMoneyToCents(pick("payMin"))
	const payMaxCents = parseMoneyToCents(pick("payMax"))
	const payUnitRaw = text(pick("payUnit"))?.toLowerCase() ?? null
	const payUnit = payUnitRaw && PAY_UNITS.has(payUnitRaw) ? payUnitRaw : null
	// Conservative pay rule: cents ship ONLY as a coherent set (a min, a valid
	// range, and a unit the platform understands). Anything else keeps the
	// source's verbatim pay text alone.
	const coherentPay =
		payMinCents != null &&
		payUnit != null &&
		(payMaxCents == null || payMaxCents >= payMinCents)

	const beginsAt = parseIsoDate(pick("beginsAt"))
	const endsAtRaw = parseIsoDate(pick("endsAt"))
	// An end before the start is source noise — keep the start, drop the end
	// (never reorder or guess).
	const endsAt = endsAtRaw && beginsAt && endsAtRaw < beginsAt ? null : endsAtRaw
	const location = text(pick("location"))
	const latitude = parseCoordinate(pick("latitude"), -90, 90)
	const longitude = parseCoordinate(pick("longitude"), -180, 180)
	// A map point is one sourced fact, not two independent numbers. Persist it
	// only when the provider supplied a complete bounded pair and a display
	// location; otherwise keep the honest label-only/unspecified state.
	const coherentPoint = location !== null && latitude !== null && longitude !== null

	return {
		ok: true,
		record: {
			title,
			description: text(pick("description")),
			employerName: text(pick("employerName")),
			externalId,
			sourceUrl,
			location,
			latitude: coherentPoint ? latitude : null,
			longitude: coherentPoint ? longitude : null,
			housing: parseStatedBenefit(pick("housing")),
			housingDetails: text(pick("housingDetails")),
			meals: parseStatedBenefit(pick("meals")),
			mealsDetails: text(pick("mealsDetails")),
			payText: text(pick("payText")),
			payMinCents: coherentPay ? payMinCents : null,
			payMaxCents: coherentPay ? payMaxCents : null,
			payUnit: coherentPay ? payUnit : null,
			beginsAt,
			endsAt,
			expiresAt: parseIsoDate(pick("expiresAt")),
			publishedAt: parseIsoDate(pick("publishedAt")),
			sourceCategoryValue: text(pick("category"))?.toLowerCase() ?? null,
		},
	}
}

/* ------------------------------------------------------------ classification */

export const PLATFORM_CATEGORIES = ["farm", "maritime", "remote", "seasonal"] as const
export type PlatformCategory = (typeof PLATFORM_CATEGORIES)[number]

export interface ClassificationResult {
	/** null = cannot classify honestly → founder review, never a guess. */
	readonly category: PlatformCategory | null
	readonly confidence: "high" | "medium" | "low"
	readonly rationale: string
	readonly needsReview: boolean
}

/** Deterministic keyword lexicon per category (whole-word matches). */
const CATEGORY_LEXICON: Readonly<Record<PlatformCategory, readonly string[]>> = {
	farm: [
		"farm", "farmhand", "ranch", "orchard", "harvest", "vineyard", "livestock",
		"agriculture", "agricultural", "wwoof", "homestead", "greenhouse", "dairy",
	],
	maritime: [
		"deckhand", "boat", "vessel", "sailing", "yacht", "marina", "maritime",
		"fishing", "fishery", "charter", "crew", "stewardess", "captain",
	],
	remote: [
		"remote", "work from home", "work-from-home", "location independent",
		"telecommute", "virtual assistant",
	],
	seasonal: [
		"ski", "resort", "lodge", "national park", "summer camp", "seasonal",
		"hostel", "housekeeping", "lift operator", "raft guide", "festival",
		"backcountry", "wilderness", "camp counselor", "hospitality",
	],
}

function wholeWordHit(haystack: string, needle: string): boolean {
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(haystack)
}

/**
 * Classify into EXACTLY one of the four platform categories, or refuse.
 * Precedence: explicit config categoryMap (source told us) → keyword lexicon.
 * Multi-category or zero-signal records are flagged for review — the platform
 * law of four honest lanes beats coverage.
 */
export function classifyCategory(
	record: NormalizedSourceRecord,
	categoryMap?: Readonly<Record<string, PlatformCategory>>,
): ClassificationResult {
	if (record.sourceCategoryValue && categoryMap) {
		const mapped = categoryMap[record.sourceCategoryValue]
		if (mapped) {
			return {
				category: mapped,
				confidence: "high",
				rationale: `source category "${record.sourceCategoryValue}" is mapped to ${mapped}`,
				needsReview: false,
			}
		}
	}

	const corpus = `${record.title} ${record.description ?? ""}`.toLowerCase()
	const hits: Array<{ category: PlatformCategory; terms: string[] }> = []
	for (const category of PLATFORM_CATEGORIES) {
		const terms = CATEGORY_LEXICON[category].filter((term) => wholeWordHit(corpus, term))
		if (terms.length > 0) hits.push({ category, terms })
	}

	if (hits.length === 1) {
		const [only] = hits
		return {
			category: only.category,
			confidence: only.terms.length >= 2 ? "high" : "medium",
			rationale: `matched ${only.category} terms: ${only.terms.slice(0, 4).join(", ")}`,
			needsReview: false,
		}
	}

	if (hits.length > 1) {
		// One clearly dominant category (≥2 more terms than every rival) is
		// accepted at medium confidence; anything closer goes to review.
		const sorted = [...hits].sort((a, b) => b.terms.length - a.terms.length)
		if (sorted[0].terms.length >= sorted[1].terms.length + 2) {
			return {
				category: sorted[0].category,
				confidence: "medium",
				rationale: `dominant ${sorted[0].category} (${sorted[0].terms.length} terms) over ${sorted[1].category} (${sorted[1].terms.length})`,
				needsReview: false,
			}
		}
		return {
			category: null,
			confidence: "low",
			rationale: `ambiguous between ${sorted.map((h) => h.category).join(", ")}`,
			needsReview: true,
		}
	}

	return {
		category: null,
		confidence: "low",
		rationale: "no category signal in title/description and no source category mapping",
		needsReview: true,
	}
}

/* ------------------------------------------------------------- fingerprints */

const sha256 = (input: string): string =>
	createHash("sha256").update(input, "utf8").digest("hex")

/** Idempotency anchor for a whole payload (byte-stable). */
export function payloadFingerprint(payloadText: string): string {
	return sha256(payloadText)
}

/**
 * Stable content fingerprint over the salient normalized facts — detects a
 * changed posting independent of payload formatting or field order.
 */
export function contentFingerprint(record: NormalizedSourceRecord): string {
	const salient = [
		record.title.toLowerCase(),
		record.employerName?.toLowerCase() ?? "",
		record.location?.toLowerCase() ?? "",
		record.description?.toLowerCase().slice(0, 500) ?? "",
		record.housing.status === "stated" ? String(record.housing.value) : "ns",
		record.meals.status === "stated" ? String(record.meals.value) : "ns",
		record.payText?.toLowerCase() ?? "",
		String(record.payMinCents ?? ""),
		String(record.payMaxCents ?? ""),
		record.payUnit ?? "",
		record.beginsAt ?? "",
		record.endsAt ?? "",
	].join("␟")
	return sha256(salient)
}

/** Canonicalize a source URL: https, lowercase host, no tracking params/hash. */
export function canonicalizeSourceUrl(url: string | null): string | null {
	if (!url) return null
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
		parsed.hash = ""
		const params = [...parsed.searchParams.keys()]
		for (const key of params) {
			if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) parsed.searchParams.delete(key)
		}
		parsed.hostname = parsed.hostname.toLowerCase()
		let out = parsed.toString()
		if (out.endsWith("/")) out = out.slice(0, -1)
		return out
	} catch {
		return null
	}
}

/** Conservative fuzzy identity: employer + title + location, normalized. */
export function fuzzyIdentityKey(args: {
	readonly employerName: string | null
	readonly title: string
	readonly location: string | null
}): string | null {
	if (!args.employerName || !args.location) return null // too weak without both
	const norm = (value: string): string =>
		value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
	return `${norm(args.employerName)}|${norm(args.title)}|${norm(args.location)}`
}

/* -------------------------------------------------------------- import plan */

/** What the planner knows about one existing inventory row. */
export interface ExistingListingRef {
	readonly listingId: string
	readonly provenance: "verified" | "sourced"
	readonly fingerprint: string | null
}

/** Pre-built lookups over existing inventory (query layer supplies these). */
export interface InventoryIndex {
	/** `${sourceId}␟${externalId}` → sourced listing from THIS source. */
	readonly byExternalId: ReadonlyMap<string, ExistingListingRef>
	readonly byCanonicalUrl: ReadonlyMap<string, ExistingListingRef>
	readonly byFingerprint: ReadonlyMap<string, ExistingListingRef>
	/** fuzzyIdentityKey → refs (both provenances; drives review flags). */
	readonly byFuzzyKey: ReadonlyMap<string, readonly ExistingListingRef[]>
}

export type ImportOutcome =
	| "inserted"
	| "updated"
	| "unchanged"
	| "exact_duplicate"
	| "probable_duplicate"
	| "verified_match"
	| "rejected"
	| "quarantined"

export interface PlannedRecord {
	readonly raw: RawSourceRecord
	readonly record: NormalizedSourceRecord | null
	readonly classification: ClassificationResult | null
	readonly fingerprint: string | null
	readonly outcome: ImportOutcome
	readonly rejectReason: string | null
	/** The existing listing this record refreshes / collides with. */
	readonly matchedListingId: string | null
}

export interface ImportPlan {
	readonly records: readonly PlannedRecord[]
	readonly stats: Readonly<Record<string, number>>
}

/**
 * Whether a planned record lands in the founder review queue: everything
 * quarantined or probably-duplicated, plus fuzzy verified-matches (a
 * hypothesis a human must confirm — identity/content verified-matches carry
 * no rejectReason and are conclusive, so they don't queue).
 */
export function recordNeedsReview(entry: PlannedRecord): boolean {
	return (
		entry.outcome === "quarantined" ||
		entry.outcome === "probable_duplicate" ||
		(entry.outcome === "verified_match" && entry.rejectReason !== null)
	)
}

/**
 * Decide the fate of every raw record against existing inventory —
 * deterministic, reviewable, and side-effect free.
 *
 * Decision ladder (per record):
 *  1. normalize; failure → rejected (reason preserved).
 *  2. classify; no honest category → quarantined (founder review).
 *  3. identity match (this source's external id, then canonical URL):
 *       verified listing → verified_match (NEVER touched by imports);
 *       sourced + same fingerprint → unchanged;
 *       sourced + new fingerprint → updated (source changed the posting).
 *  4. content fingerprint match anywhere → exact_duplicate.
 *  5. fuzzy identity hit → probable_duplicate (review; NO auto-merge —
 *     false merges are worse than visible duplicates).
 *  6. otherwise → inserted.
 * In-batch duplicates (same external id / url / fingerprint twice in one
 * payload) collapse to exact_duplicate after the first.
 */
export function planImport(
	rawRecords: readonly RawSourceRecord[],
	mapping: SourceFieldMapping,
	sourceId: string,
	index: InventoryIndex,
): ImportPlan {
	const planned: PlannedRecord[] = []
	const seenExternal = new Set<string>()
	const seenUrls = new Set<string>()
	const seenFingerprints = new Set<string>()

	for (const raw of rawRecords) {
		const normalized = normalizeRecord(raw, mapping)
		if (!normalized.ok) {
			planned.push({
				raw, record: null, classification: null, fingerprint: null,
				outcome: "rejected", rejectReason: normalized.reason, matchedListingId: null,
			})
			continue
		}
		const record = normalized.record
		const classification = classifyCategory(record, mapping.categoryMap)
		const fingerprint = contentFingerprint(record)

		if (classification.category === null) {
			planned.push({
				raw, record, classification, fingerprint,
				outcome: "quarantined", rejectReason: classification.rationale, matchedListingId: null,
			})
			continue
		}

		// In-batch dedup first.
		const externalKey = record.externalId ? `${sourceId}␟${record.externalId}` : null
		const inBatchDuplicate =
			(externalKey && seenExternal.has(externalKey)) ||
			(record.sourceUrl && seenUrls.has(record.sourceUrl)) ||
			seenFingerprints.has(fingerprint)
		if (externalKey) seenExternal.add(externalKey)
		if (record.sourceUrl) seenUrls.add(record.sourceUrl)
		seenFingerprints.add(fingerprint)
		if (inBatchDuplicate) {
			planned.push({
				raw, record, classification, fingerprint,
				outcome: "exact_duplicate", rejectReason: "duplicate within payload", matchedListingId: null,
			})
			continue
		}

		// Identity match: this source's own posting.
		const identityRef =
			(externalKey ? index.byExternalId.get(externalKey) : undefined) ??
			(record.sourceUrl ? index.byCanonicalUrl.get(record.sourceUrl) : undefined)

		if (identityRef) {
			if (identityRef.provenance === "verified") {
				// A claimed/converted listing: re-imports must never overwrite it.
				planned.push({
					raw, record, classification, fingerprint,
					outcome: "verified_match", rejectReason: null, matchedListingId: identityRef.listingId,
				})
				continue
			}
			planned.push({
				raw, record, classification, fingerprint,
				outcome: identityRef.fingerprint === fingerprint ? "unchanged" : "updated",
				rejectReason: null,
				matchedListingId: identityRef.listingId,
			})
			continue
		}

		// Content-identical posting already in inventory (e.g. via another URL).
		const fingerprintRef = index.byFingerprint.get(fingerprint)
		if (fingerprintRef) {
			planned.push({
				raw, record, classification, fingerprint,
				outcome: fingerprintRef.provenance === "verified" ? "verified_match" : "exact_duplicate",
				rejectReason: null,
				matchedListingId: fingerprintRef.listingId,
			})
			continue
		}

		// Conservative similarity: same employer+title+location. Both branches
		// are review-flagged — a fuzzy hit is a HYPOTHESIS, and silently dropping
		// a possibly-distinct new posting against verified inventory would hide
		// real inventory on a guess (a founder confirms instead).
		const fuzzyKey = fuzzyIdentityKey(record)
		const fuzzyRefs = fuzzyKey ? index.byFuzzyKey.get(fuzzyKey) : undefined
		if (fuzzyRefs && fuzzyRefs.length > 0) {
			const verifiedHit = fuzzyRefs.find((ref) => ref.provenance === "verified")
			planned.push({
				raw, record, classification, fingerprint,
				outcome: verifiedHit ? "verified_match" : "probable_duplicate",
				rejectReason: verifiedHit
					? "similar to an existing VERIFIED listing — review before insert"
					: "similar existing listing — review before insert",
				matchedListingId: (verifiedHit ?? fuzzyRefs[0]).listingId,
			})
			continue
		}

		planned.push({
			raw, record, classification, fingerprint,
			outcome: "inserted", rejectReason: null, matchedListingId: null,
		})
	}

	const stats: Record<string, number> = { received: rawRecords.length }
	for (const entry of planned) {
		stats[entry.outcome] = (stats[entry.outcome] ?? 0) + 1
	}
	return { records: planned, stats }
}
