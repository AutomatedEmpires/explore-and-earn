/**
 * Guardrail G1 / Gate P-UNIT enforcement — host plan pricing MUST be integer cents.
 *
 * Canon: Founder Locked Pricing (ADR-028). Host plan amounts in integer cents
 * (annual = 10x monthly):
 *   starter      monthly 19900  yearly 199000
 *   professional monthly 39900  yearly 399000
 *   enterprise   monthly 74900  yearly 749000
 *
 * This check reads packages/contracts/src/pricing.ts and asserts that
 * FOUNDER_LOCKED_PRICING holds those exact cent values. It NEVER modifies
 * pricing.ts and invents no pricing — the cent values are derived directly from
 * the founder-locked dollar canon (x100).
 *
 * EXPECTED STATE (as of this build pack): pricing.ts stores DOLLARS
 * (199, 1990, ...), so this check is EXPECTED TO FAIL. That red is the intended
 * P-UNIT gate signal for open question Q-BILL-1 (dollars->cents normalization),
 * NOT a regression. Founder approval is required to normalize pricing.ts; once
 * done, this check turns green.
 */
import { readFileSync } from "node:fs"

const PRICING_FILE = "packages/contracts/src/pricing.ts"

// Canon integer-cent amounts (ADR-028). Keys mirror FOUNDER_LOCKED_PRICING.
const EXPECTED_CENTS = {
	starter: { monthly: 19900, yearly: 199000 },
	professional: { monthly: 39900, yearly: 399000 },
	enterprise: { monthly: 74900, yearly: 749000 },
}

let source
try {
	source = readFileSync(PRICING_FILE, "utf8")
} catch {
	console.error(`G1/P-UNIT: cannot read ${PRICING_FILE}`)
	process.exit(1)
}

const failures = []

for (const [plan, intervals] of Object.entries(EXPECTED_CENTS)) {
	const blockMatch = source.match(
		new RegExp(`${plan}\\s*:\\s*\\{([\\s\\S]*?)\\}`, "i"),
	)
	if (!blockMatch) {
		failures.push(`${plan}: plan block not found in FOUNDER_LOCKED_PRICING`)
		continue
	}
	const block = blockMatch[1]
	for (const [interval, expected] of Object.entries(intervals)) {
		const m = block.match(new RegExp(`${interval}\\s*:\\s*(\\d+)`, "i"))
		if (!m) {
			failures.push(`${plan}.${interval}: amount not found`)
			continue
		}
		const actual = Number(m[1])
		if (actual !== expected) {
			const dollarsHint =
				actual * 100 === expected ? " (looks like DOLLARS — Q-BILL-1 drift)" : ""
			failures.push(
				`${plan}.${interval}: expected ${expected} cents, found ${actual}${dollarsHint}`,
			)
		}
	}
}

if (failures.length > 0) {
	console.error("G1/P-UNIT: FOUNDER_LOCKED_PRICING is not in canon integer cents:")
	for (const f of failures) console.error(`  - ${f}`)
	console.error(
		"This failure is the INTENDED P-UNIT gate for Q-BILL-1 (dollars->cents). " +
			"Founder approval is required before normalizing pricing.ts.",
	)
	process.exit(1)
}

console.log(
	"pricing-units: FOUNDER_LOCKED_PRICING is in canon integer cents (G1/P-UNIT green)",
)
