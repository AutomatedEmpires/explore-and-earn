/**
 * Guardrail G-BILL-4 — the checked-in expected-stripe-manifest.json MUST match
 * the conventional Stripe catalog (products, prices, coupons) declared in
 * packages/stripe-seed/src/catalog.ts.
 *
 * Structural, set-based comparison: deterministic and order-independent. Amounts
 * are intentionally excluded (G1: amounts live in packages/contracts/src/pricing.ts).
 * Rebuild the expected manifest ONLY via an ADR-approved catalog change.
 */
import { readFileSync } from "node:fs"

const CATALOG_FILE = "packages/stripe-seed/src/catalog.ts"
const MANIFEST_FILE = "packages/stripe-seed/expected-stripe-manifest.json"

function extractArray(source, name) {
	const match = source.match(
		new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`),
	)
	if (!match) return null
	return [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
}

let catalogSource
let manifestRaw
try {
	catalogSource = readFileSync(CATALOG_FILE, "utf8")
} catch {
	console.error(`G-BILL-4: cannot read ${CATALOG_FILE}`)
	process.exit(1)
}
try {
	manifestRaw = readFileSync(MANIFEST_FILE, "utf8")
} catch {
	console.error(`G-BILL-4: cannot read ${MANIFEST_FILE}`)
	process.exit(1)
}

const planProducts = extractArray(catalogSource, "PLAN_PRODUCTS") ?? []
const addonProducts = extractArray(catalogSource, "ADDON_PRODUCTS") ?? []
const planPrices = extractArray(catalogSource, "PLAN_PRICES") ?? []
const addonPrices = extractArray(catalogSource, "ADDON_PRICES") ?? []
const foundingCoupons = extractArray(catalogSource, "FOUNDING_COUPONS") ?? []

const expectedTokens = new Set([
	...[...planProducts, ...addonProducts].map((n) => `product:${n}`),
	...[...planPrices, ...addonPrices].map((n) => `price:${n}`),
	...foundingCoupons.map((n) => `coupon:${n}`),
])

if (expectedTokens.size === 0) {
	console.error("G-BILL-4: could not extract any catalog keys from catalog.ts")
	process.exit(1)
}

let manifest
try {
	manifest = JSON.parse(manifestRaw)
} catch {
	console.error(`G-BILL-4: ${MANIFEST_FILE} is not valid JSON`)
	process.exit(1)
}

if (manifest.status === "placeholder") {
	console.error(
		"G-BILL-4: expected-stripe-manifest.json is still a placeholder; populate it from the canonical catalog.",
	)
	process.exit(1)
}

if (!Array.isArray(manifest.entries)) {
	console.error(
		"G-BILL-4: expected-stripe-manifest.json has no `entries` array",
	)
	process.exit(1)
}

const VALID_KINDS = new Set(["product", "price", "coupon"])
const manifestTokens = new Set()
for (const entry of manifest.entries) {
	if (
		!entry ||
		typeof entry.kind !== "string" ||
		typeof entry.conventionalName !== "string" ||
		!VALID_KINDS.has(entry.kind)
	) {
		console.error(`G-BILL-4: invalid manifest entry: ${JSON.stringify(entry)}`)
		process.exit(1)
	}
	manifestTokens.add(`${entry.kind}:${entry.conventionalName}`)
}

const missing = [...expectedTokens].filter((t) => !manifestTokens.has(t)).sort()
const extra = [...manifestTokens].filter((t) => !expectedTokens.has(t)).sort()

if (missing.length || extra.length) {
	console.error("G-BILL-4: manifest drift vs the conventional catalog:")
	for (const t of missing)
		console.error(`  - in catalog but missing from manifest -> ${t}`)
	for (const t of extra)
		console.error(`  - in manifest but absent from catalog -> ${t}`)
	process.exit(1)
}

console.log(
	`stripe-manifest: expected manifest matches the conventional catalog (${manifestTokens.size} entries)`,
)
