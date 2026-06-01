# CI Guardrail: canon-contract checks

> Script: `tools/scripts/check-canon-contracts.mjs`
> Runs as part of `corepack pnpm guardrails` (CI `guardrails` job).
> Source of truth: `docs/product/discovery-card-v1.md`, `docs/product/product-principles.md`,
> `docs/source-of-truth/contracts/discovery-card-contract.md`.

## Why

As more agents start writing code, the canon needs to defend itself in CI rather
than in review. This guardrail turns the most load-bearing Discovery Card
invariants into a failing check, anchored to the typed mirror in
`packages/contracts/src/card.ts`.

It complements the existing coarse grep checks in the `design-guardrails` CI job
(G30 icon system, G22 grep) with a precise, contract-anchored check.

## What it enforces

| Rule | Check |
| --- | --- |
| **G22 — Verified-Host qualifier** | `VERIFIED_HOST_QUALIFIER` must equal `"Self-Declared by Host"` exactly. |
| **Triad integrity** | `OpportunityTriad` must contain `housing` / `meals` / `pay` and must never declare a `perks` key. |
| **No "Perks" in code** | No `.ts` / `.tsx` file under `apps/` or `packages/` may use a `perks:` property label (the triad is never "Perks"). |
| **Field registry sync** | `DISCOVERY_CARD_FIELDS` and `DISCOVERY_CARD_FIELD_REQUIREMENT` must contain exactly the same field set. |
| **Canon present** | `docs/product/discovery-card-v1.md` must exist. |

## Order independence

If `packages/contracts/src/card.ts` is not present (e.g. the contracts mirror
has not merged yet), the card-specific checks are skipped with a `note:` and the
guardrail passes. Once the mirror lands, the checks enforce automatically. This
means the guardrail and the contracts mirror can merge in either order.

## Run locally

```bash
node tools/scripts/check-canon-contracts.mjs
corepack pnpm guardrails   # full guardrail chain
```

Expected (mirror present): `canon-contracts: Discovery Card canon invariants OK`.
Expected (mirror absent): a `note:` line, then the same OK message.

## Limitations

Like the other guardrail scripts, this is intentionally a lightweight static
(regex) check, not a full TypeScript parse. It is a safety net, not a substitute
for `pnpm typecheck` and the compile-time type tests in
`packages/contracts/src/__type-tests__/`.
