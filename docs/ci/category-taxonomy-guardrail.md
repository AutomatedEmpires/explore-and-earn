# Category taxonomy guardrail (G031)

`tools/scripts/check-category-taxonomy.mjs` is a read-only CI guardrail that
locks the marketplace category taxonomy. It runs as part of the root
`guardrails` script and exits non-zero (failing CI / `pnpm guardrails`) when it
detects category drift.

## The locked lane set

The category lanes are **exactly**, and the order does not matter:

```
farm  maritime  remote  seasonal  mix
```

Source of truth: `packages/contracts/src/enums.ts` -> `MARKETPLACE_CATEGORIES`,
mirrored by the icon taxonomy (`category.*` keys in
`packages/ui/src/icons/registry.ts`) and root `AGENTS.md`.

## What is banned

`lodge` must never be treated as a **top-level category**. The guardrail fails
on any of these shapes (outside comments / inline code):

- a `category.lodge` key (e.g. an icon registry key);
- a `CategoryKey` / `OpportunityCategory` / `MarketplaceCategory` union member
  equal to `"lodge"`;
- a category-lane array literal (`MARKETPLACE_CATEGORIES`, `CATEGORY_LANES`,
  etc.) that includes `"lodge"`;
- a `MARKETPLACE_CATEGORIES` set in `packages/contracts` that diverges from the
  locked lane set (compared as an order-independent set).

## What is allowed (explicit exceptions)

`lodge` is a legitimate word; only its use **as a category** is banned. These
stay green:

- **Host-type noun** — "hosts: farms, lodges, maritime operators" describes who
  posts opportunities.
- **Setting/environment under `seasonal`** — a lodge is a place a seasonal
  opportunity can take place; map lodge-type listings to `category.seasonal`.
- **Documentation of the rule** — comments and markdown inline code (e.g. "there
  is no `category.lodge` key") are ignored so canon docs can describe the ban.

## Ownership / keeping `main` green

The guardrail never edits files. To avoid colliding with other in-flight PRs,
references found in files owned by those PRs are downgraded to non-fatal
`note:` lines instead of failures:

- `packages/ui/src/icons/registry.ts` (PR #16)
- `docs/design/visual-language.md`, `docs/product/discovery-card-v1.md`,
  `docs/product/product-principles.md` (PR #18 — `fix/purge-lodge-top-level-category`)

New violations in any other file still fail the build.

## Resilience

If a target source file (e.g. the contracts enum or the UI registry) is absent
on the current ref, the relevant check is **skipped with a note and passes**,
so this guardrail can land independently of the PRs that introduce those
sources. Enforcement automatically activates once the file is present.

## Limitations

- Documentation detection is heuristic (comment prefixes and markdown inline
  code via backtick parity). A banned shape deliberately hidden inside inline
  code would be treated as documentation.
- Detection is text/regex based, not a TypeScript AST parse, so exotic
  formatting of unions or array literals may not be recognized. The checks
  target the conventional shapes used in this repo.

## Running locally

```bash
node tools/scripts/check-category-taxonomy.mjs   # prints "category-taxonomy: locked lane set OK"
corepack pnpm guardrails                          # full guardrail chain
```
