# Category Taxonomy Guardrail

> CI guardrail for the locked top-level category taxonomy.
> Script: `tools/scripts/check-category-taxonomy.mjs`

## The Locked Lane Set

As of **2026-06-01**, the top-level product category lanes are locked to exactly:

```
farm | maritime | remote | seasonal | mix
```

**`lodge` is NOT a top-level category.** It is a setting/environment sub-type under `seasonal`.

### Sources of truth

- `docs/product/discovery-card-v1.md`
- `docs/design/visual-language.md`
- `docs/product/product-principles.md`
- PR [#18](../../pulls/18) (`fix/purge-lodge-top-level-category`)

## What the Guardrail Enforces

The script scans `.ts`, `.tsx`, `.mjs`, and `.md` files under `apps/`, `packages/`, and `docs/` and **exits 1** if `lodge` appears as a top-level category in any of these forms:

| Pattern | Example | Reason |
|---------|---------|--------|
| Category domain key | `"category.lodge"` | Lodge coded as a product lane key |
| TypeScript union member | `\| "lodge"` in a `CategoryKey`/`OpportunityCategory` type | Lodge in a typed category enum |
| Category-lane list member | `farm/lodge/maritime` or `farm, lodge, remote` | Lodge alongside peer categories |

It also **exits 1** if a category-lane set declaration in `packages/contracts` or `packages/ui` diverges from the locked set (order-independent set comparison -- adding or removing any lane is detected).

## Allowed Lodge Uses (Not Violations)

The script permits two classes of `lodge` usage that are NOT top-level category violations:

### (a) Host-type noun

Lodge used as a class of hospitality venue or host operator, not as a product lane.

```
farms, lodges, maritime operators, remote employers
```

This is descriptive English, not a category enumeration. The allow pattern matches lodge adjacent to other host-type nouns.

### (b) Seasonal setting / environment sub-type

Lodge used as a visual environment or activity setting within the `seasonal` lane.

```
Seasonal/Lodge   Seasonal Lodge   SEASONAL LODGE/OUTDOOR   "Lodge / Outdoor" (label)
```

These represent lodge as a sub-type of seasonal, consistent with the taxonomy decision.

## Order-Independence (Skip-with-Note-and-Pass)

If a scan root (`apps/`, `packages/`, `docs/`) or a set-check target file does not exist on disk, the check is **skipped with a `note:` line** and the script still exits 0. This makes the guardrail safe to add to main before all owning PRs land.

## Note-Only Paths (Pre-existing Violations from Unmerged PRs)

The following paths have known violations on `main` that are owned by open PRs. For these paths the script emits a `note:` warning but does **not** set `exit 1`. This prevents breaking the guardrails chain before those PRs are merged.

| File | Owning PR | Disposition |
|------|-----------|-------------|
| `packages/ui/src/icons/registry.ts` | PR #16 (icon registry overhaul) | `note:` only |
| `docs/product/discovery-card-v1.md` | PR #18 (fix/purge-lodge-top-level-category) | `note:` only |
| `docs/design/figma-ai-prompts.md` | PR #18 scope (old-taxonomy design artefact) | `note:` only |

**Design decision:** Hard-failing pre-existing violations in PR-owned files would make `main` red before those PRs merge, defeating the purpose of the guardrail. The `note:` approach keeps `main` green while still making violations visible in the log. New violations in any path NOT on this list will hard-fail as normal.

## Running the Guardrail

```bash
# Standalone
node tools/scripts/check-category-taxonomy.mjs

# As part of the full guardrails chain
corepack pnpm guardrails
```

**Successful output:**

```
note: G015: lodge used as a category key (e.g. "category.lodge") in packages/ui/src/icons/registry.ts:22 -- fix in owning PR, not here
category-taxonomy: locked lane set OK
```

**Failure output** (exit 1):

```
G015: lodge used as a category key (e.g. "category.lodge") in packages/new-feature/src/types.ts:5
```

## Guardrails Chain Position

Added as the last step in the `guardrails` npm script in `package.json`:

```
corepack pnpm db:assert
  && node tools/scripts/check-pricing.mjs
  && node tools/scripts/check-calendar-sync.mjs
  && node tools/scripts/check-match-isolation.mjs
  && node tools/scripts/check-category-taxonomy.mjs
```

## Error Code

All violations use error code **G015**.

## Limitations

- The guardrail uses regex pattern matching on individual lines. Multi-line category declarations (e.g., an array spread across many lines with each element on its own line) may be detected by the set-comparison check but might not be caught by the line-scan patterns if no single line contains the lodge key adjacent to another lane name.
- The allow patterns depend on textual context. Unconventionally formatted host-type noun lists may not be exempted. When in doubt, add an inline comment to clarify intent.
- The `NOTE_ONLY_PATHS` list must be maintained manually. When a note-only PR is merged, remove its entry from the list and re-run the guardrail to confirm the violation is fixed upstream.

## Inventory of Remaining Lodge-as-Category Violations on `main`

These violations exist on `main` as of 2026-06-01 and are tracked for the owning PRs to fix:

| File | Line | Content | Owning PR |
|------|------|---------|-----------|
| `packages/ui/src/icons/registry.ts` | 22 | `` \| "category.lodge" `` | PR #16 |
| `packages/ui/src/icons/registry.ts` | 64 | `"category.lodge": { key: "category.lodge", ... }` | PR #16 |
| `docs/product/discovery-card-v1.md` | 23 | `lane (farm/lodge/maritime/remote)` | PR #18 |
| `docs/design/figma-ai-prompts.md` | 97 | `category filter pills (Farm, Lodge/Outdoor, Maritime, Remote)` | PR #18 scope |
