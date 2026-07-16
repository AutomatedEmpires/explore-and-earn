import { readFileSync, existsSync } from "node:fs"

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

const errors = []
const notices = []

// 1) The committed canon doc the mirror cites must exist.
if (!existsSync(CANON_DOC)) {
	errors.push(`G-CANON: missing committed canon doc ${CANON_DOC}`)
}

// 2) Contract-anchored checks (only when the typed mirror is present).
if (existsSync(CARD)) {
	const card = readFileSync(CARD, "utf8")

	// 2a) Verified-Host badge must stay subscription-gated (founder decision
	// 2026-07-03, supersedes the prior self-declared qualifier G22).
	if (!card.includes("export function hasVerifiedHostSubscription(")) {
		errors.push(
			`G22: ${CARD} must define hasVerifiedHostSubscription() — the Verified Host badge is subscription-gated, not self-declared.`,
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

// 3) [Scoped 2026-07-15, founder decision] The previous repo-wide ban on any
// "perks" property label is removed: "Perks & benefits" is a legitimate listing/
// host section distinct from the value triad. The triad stays locked to
// Housing/Meals/Pay by check 2b above (OpportunityTriad must never include a
// "perks" key).

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

for (const note of notices) console.log(`note: ${note}`)

if (errors.length > 0) {
	for (const error of errors) console.error(error)
	process.exit(1)
}

console.log("canon-contracts: Discovery Card canon invariants OK")
