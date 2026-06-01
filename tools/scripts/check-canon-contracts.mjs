import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/*
 * Canon-contract guardrail.
 *
 * Read-only static checks that enforce Discovery Card canon invariants against
 * the typed mirror in packages/contracts. Source of truth:
 *   - docs/product/discovery-card-v1.md
 *   - docs/product/product-principles.md (#1 triad; #4 trust)
 *   - docs/source-of-truth/contracts/discovery-card-contract.md
 *
 * Style mirrors tools/scripts/check-pricing.mjs (regex over source files).
 * Safe to run before the contracts mirror lands: card.ts checks are skipped
 * (with a notice) when packages/contracts/src/card.ts does not exist yet, so
 * this can merge in any order relative to the contracts PR.
 */

const CARD = "packages/contracts/src/card.ts"
const CANON_DOC = "docs/product/discovery-card-v1.md"
const VERIFIED_HOST_QUALIFIER = "Self-Declared by Host"

const errors = []
const notices = []

// 1) The committed canon doc the mirror cites must exist.
if (!existsSync(CANON_DOC)) {
	errors.push(`G-CANON: missing committed canon doc ${CANON_DOC}`)
}

// 2) Contract-anchored checks (only when the typed mirror is present).
if (existsSync(CARD)) {
	const card = readFileSync(CARD, "utf8")

	// 2a) Verified-Host qualifier must be the exact canon string (G22).
	if (!card.includes(`VERIFIED_HOST_QUALIFIER = "${VERIFIED_HOST_QUALIFIER}"`)) {
		errors.push(
			`G22: ${CARD} must define VERIFIED_HOST_QUALIFIER = "${VERIFIED_HOST_QUALIFIER}" exactly.`,
		)
	}

	// 2b) The triad interface must be Housing/Meals/Pay and never "Perks".
	const triadMatch = card.match(/interface OpportunityTriad\s*\{([\s\S]*?)\}/)
	if (!triadMatch) {
		errors.push(`G-TRIAD: ${CARD} must export interface OpportunityTriad.`)
	} else {
		const body = triadMatch[1]
		for (const key of ["housing", "meals", "pay"]) {
			if (!new RegExp(`\\b${key}\\s*[:?]`).test(body)) {
				errors.push(`G-TRIAD: OpportunityTriad is missing the "${key}" key.`)
			}
		}
		if (/\bperks\s*[:?]/i.test(body)) {
			errors.push(`G-TRIAD: OpportunityTriad must never include a "perks" key.`)
		}
	}

	// 2c) Field registry and requirement map must stay in sync.
	const fields = extractTuple(card, "DISCOVERY_CARD_FIELDS")
	const reqKeys = extractRecordKeys(card, "DISCOVERY_CARD_FIELD_REQUIREMENT")
	if (fields.length === 0) {
		errors.push(`G-FIELDS: could not parse DISCOVERY_CARD_FIELDS in ${CARD}.`)
	} else {
		for (const field of fields) {
			if (!reqKeys.includes(field)) {
				errors.push(
					`G-FIELDS: "${field}" is in DISCOVERY_CARD_FIELDS but missing from DISCOVERY_CARD_FIELD_REQUIREMENT.`,
				)
			}
		}
		for (const key of reqKeys) {
			if (!fields.includes(key)) {
				errors.push(
					`G-FIELDS: "${key}" is in DISCOVERY_CARD_FIELD_REQUIREMENT but not in DISCOVERY_CARD_FIELDS.`,
				)
			}
		}
	}
} else {
	notices.push(
		`${CARD} not present yet — skipping contract checks (will enforce once the Discovery Card mirror lands).`,
	)
}

// 3) Repo-wide: "Perks" must never be used as a triad property label in source.
const SKIP_DIRS = new Set([
	"node_modules",
	".next",
	"dist",
	".turbo",
	".git",
	"__type-tests__",
])
const SRC_PATTERN = /\.(ts|tsx)$/
const SELF = "tools/scripts/check-canon-contracts.mjs"

for (const root of ["apps", "packages"]) {
	if (!existsSync(root)) continue
	for (const file of walk(root)) {
		if (file.endsWith(SELF)) continue
		const content = readFileSync(file, "utf8")
		if (/\bperks\s*[:?]/i.test(content)) {
			errors.push(
				`G-TRIAD: forbidden "perks" property label in ${file} — the value triad is Housing/Meals/Pay, never "Perks".`,
			)
		}
	}
}

function extractTuple(src, name) {
	const match = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`))
	if (!match) return []
	return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1])
}

function extractRecordKeys(src, name) {
	const match = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\}`))
	if (!match) return []
	return [...match[1].matchAll(/(\w+)\s*:/g)].map((entry) => entry[1])
}

function walk(directory, files = []) {
	for (const entry of readdirSync(directory)) {
		if (SKIP_DIRS.has(entry)) continue
		const fullPath = join(directory, entry)
		const stats = statSync(fullPath)
		if (stats.isDirectory()) {
			walk(fullPath, files)
			continue
		}
		if (SRC_PATTERN.test(fullPath)) files.push(fullPath)
	}
	return files
}

for (const note of notices) console.log(`note: ${note}`)

if (errors.length > 0) {
	for (const error of errors) console.error(error)
	process.exit(1)
}

console.log("canon-contracts: Discovery Card canon invariants OK")
