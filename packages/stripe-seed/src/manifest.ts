/**
 * Deterministic seed manifest builder (DRAFT placeholder). Pure, no I/O, no
 * Stripe calls, no secrets. Produces a stable manifest + FNV-1a hash of the
 * conventional catalog so CI can compare the dry-run plan to the checked-in
 * expected-stripe-manifest.json WITHOUT touching Stripe.
 *
 * NOTE: amounts are intentionally excluded (G1; amounts live in pricing.ts).
 * Once Q-BILL-1 (dollars->cents) is resolved, the manifest MAY incorporate
 * integer-cent amounts for stronger drift detection.
 */

import { CATALOG_KEYS } from "./catalog"

export interface SeedManifestEntry {
	kind: "product" | "price" | "coupon"
	conventionalName: string
}

export interface SeedManifest {
	version: 1
	entries: ReadonlyArray<SeedManifestEntry>
	hash: string
}

function buildEntries(): SeedManifestEntry[] {
	const entries: SeedManifestEntry[] = []
	for (const name of CATALOG_KEYS.planProducts)
		entries.push({ kind: "product", conventionalName: name })
	for (const name of CATALOG_KEYS.addonProducts)
		entries.push({ kind: "product", conventionalName: name })
	for (const name of CATALOG_KEYS.planPrices)
		entries.push({ kind: "price", conventionalName: name })
	for (const name of CATALOG_KEYS.addonPrices)
		entries.push({ kind: "price", conventionalName: name })
	for (const name of CATALOG_KEYS.foundingCoupons)
		entries.push({ kind: "coupon", conventionalName: name })
	// Deterministic ordering for stable hashing.
	return entries.sort((a, b) =>
		`${a.kind}:${a.conventionalName}`.localeCompare(
			`${b.kind}:${b.conventionalName}`,
		),
	)
}

/** FNV-1a 32-bit hash. Deterministic, dependency-free; NOT cryptographic. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, "0")
}

export function buildSeedManifest(): SeedManifest {
	const entries = buildEntries()
	const canonical = entries
		.map((e) => `${e.kind}:${e.conventionalName}`)
		.join("|")
	return { version: 1, entries, hash: fnv1a(canonical) }
}

/** Compare a freshly built manifest hash to an expected hash (CI drift check). */
export function manifestMatches(expectedHash: string): boolean {
	return buildSeedManifest().hash === expectedHash
}
