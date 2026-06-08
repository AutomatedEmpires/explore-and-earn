#!/usr/bin/env node
// tools/scripts/check-migration-prefixes.mjs
//
// Migration numbering integrity guard.
//
// Fails (exit 1) when any of the following is true for supabase/migrations:
//   1. A migration filename does not match NNN_snake_case_name.sql
//      (exactly three leading digits).
//   2. Two or more migration files share the same numeric prefix.
//   3. A migration uses a number that is NOT reserved in
//      tools/scripts/migration-allocations.json. To add a migration you must
//      first reserve its number in the registry in a reviewed change, which
//      prevents parallel lanes from silently claiming the same number.
//
// Emits a non-fatal warning when an on-disk slug differs from the registry
// slug (intentional renames are allowed but should update the registry).
//
// Zero runtime dependencies so it can run as a standalone CI step.
// See docs/ci/migration-prefix-guard.md.

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..")

const allocationsPath = join(here, "migration-allocations.json")

let allocations
try {
	allocations = JSON.parse(readFileSync(allocationsPath, "utf8"))
} catch (err) {
	console.error(`Cannot read allocation registry ${allocationsPath}: ${err.message}`)
	process.exit(1)
}

const migrationsDir = join(repoRoot, allocations.migrationsDir ?? "supabase/migrations")
const registry = allocations.allocations ?? {}

const FILENAME_RE = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/

const errors = []
const warnings = []

let files
try {
	files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith(".sql"))
		.sort()
} catch (err) {
	console.error(`Cannot read migrations directory ${migrationsDir}: ${err.message}`)
	process.exit(1)
}

const byNumber = new Map()

for (const file of files) {
	const match = FILENAME_RE.exec(file)
	if (!match) {
		errors.push(
			`Bad migration filename: "${file}". Expected NNN_snake_case_name.sql with a three-digit prefix.`,
		)
		continue
	}
	const [, number, slug] = match
	if (!byNumber.has(number)) byNumber.set(number, [])
	byNumber.get(number).push({ file, slug })
}

const numbers = [...byNumber.keys()].sort()

// 1) Duplicate numeric prefixes.
for (const number of numbers) {
	const entries = byNumber.get(number)
	if (entries.length > 1) {
		const names = entries.map((e) => e.file).join(", ")
		errors.push(`Duplicate migration prefix ${number}: ${names}. Each numeric prefix must be unique.`)
	}
}

// 2) Every present number must be reserved in the registry. 3) Soft slug check.
for (const number of numbers) {
	const entries = byNumber.get(number)
	const alloc = registry[number]
	if (!alloc) {
		const names = entries.map((e) => e.file).join(", ")
		errors.push(
			`Unreserved migration number ${number} (${names}). Reserve it in tools/scripts/migration-allocations.json before adding the migration.`,
		)
		continue
	}
	if (entries.length === 1 && alloc.slug && entries[0].slug !== alloc.slug) {
		warnings.push(
			`Migration ${number} slug "${entries[0].slug}" does not match registry slug "${alloc.slug}". Update the registry if this rename is intentional.`,
		)
	}
}

for (const w of warnings) console.warn(`warning: ${w}`)

if (errors.length > 0) {
	console.error("\nMigration numbering integrity check FAILED:\n")
	for (const e of errors) console.error(`  - ${e}`)
	console.error(`\n${errors.length} error(s). See docs/ci/migration-prefix-guard.md.`)
	process.exit(1)
}

console.log(
	`Migration numbering OK: ${files.length} migration file(s), ${byNumber.size} unique prefix(es), no duplicates, all numbers reserved.`,
)
