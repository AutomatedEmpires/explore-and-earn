# Contract: Discovery Card V1 (canon mirror)

> **Status:** typed canon mirror landed in `packages/contracts/src/card.ts`.
> **Source of truth (committed):** [`docs/product/discovery-card-v1.md`](../../product/discovery-card-v1.md)
> **Product lens:** [`docs/product/product-principles.md`](../../product/product-principles.md)
> **Notion canon:** *Explore&Earn — Canonical Card System Specification*
> **Guardrails:** G22 (Verified-Host self-declared), G30 (single icon system)

Notion decides. GitHub builds. This doc records what the code currently mirrors,
and — just as importantly — where the deliberate scope boundary sits.

## What this contract covers

The Discovery Card is the atomic unit of the product (product-principles.md #2).
`packages/contracts/src/card.ts` mirrors the **enumerated** parts of the
committed card canon as typed, single-source registries:

| Export | Kind | Mirrors |
| --- | --- | --- |
| `OpportunityTriad` | interface (`housing` / `meals` / `pay`) | The mandatory value triad. Never "Perks." |
| `VERIFIED_HOST_QUALIFIER` | const `"Self-Declared by Host"` | The exact, always-on Verified-Host qualifier (G22). |
| `DISCOVERY_CARD_SURFACES` | const tuple + type | The surfaces the single card component serves. |
| `DISCOVERY_CARD_ACTIONS` | const tuple + type | Seeker card actions. |
| `DISCOVERY_CARD_ACTION_DESTINATIONS` | `Record<Action, string>` | Canonical destination/effect per action. |
| `DISCOVERY_CARD_CONDITIONAL_BADGES` | const tuple + type | Conditional badges (seasonal / featured / boosted). |
| `DISCOVERY_CARD_FIELDS` | const tuple + type | The canonical "data the card represents" field list. |
| `DISCOVERY_CARD_FIELD_REQUIREMENT` | `Record<Field, "required" | "conditional">` | Requiredness per field. |

Always-on badges (category badge, Verified-Host badge) are modeled as
`required` fields; `seasonal`/`featured`/`boosted` are the conditional badge set.

## Deliberate scope boundary (DO NOT cross without approval)

Per [`packages/contracts/README.md`](../../../packages/contracts/README.md) and
product-principles "What's out of scope for now," **no persisted object model,
data dictionary, or DB schema** lands during Sprint Zero without a scoped,
founder-approved build pack. Accordingly this contract intentionally does NOT:

- define a persisted `Listing` / `Opportunity` / `Host` row shape;
- assign concrete per-field types (e.g. is `opportunity_window` two ISO dates? a
  range object? a duration?) — only the field name + requiredness are mirrored;
- model the matching algorithm. `match_score` is a **display-only** conditional
  field present on the `matched` surface; the algorithm is forbidden in Sprint Zero.

These follow the established "mirror the canonical registry" pattern already used
by `enums.ts` and `lifecycles.ts` (enumerations only, concrete modeling later).

## Open questions for founder / Copilot review

1. **Category lane set.** `discovery-card-v1.md` describes the category badge as
   `farm / lodge / maritime / remote`, while `packages/contracts/src/enums.ts`
   (and `AGENTS.md`) enumerate `farm / maritime / remote / seasonal / mix`.
   These should be reconciled in canon before any card binds a category type.
   This contract does **not** redefine categories — it defers to `enums.ts`.
2. **`opportunity_window` shape.** Confirm representation (start/end ISO dates vs.
   range object) when the data-dictionary build pack is scoped.
3. **`match_score` scale.** Confirm 0–100 vs. 0–1 and rounding when matching is
   approved. Tracked in `docs/source-of-truth/open-questions.md`.

## Verification

```bash
corepack pnpm --filter @explore-and-earn/contracts typecheck
corepack pnpm typecheck   # tsc -b across the workspace
```

Compile-time tests live in
`packages/contracts/src/__type-tests__/discovery-card.type-test.ts` and are
validated by `tsc` (no runtime). They assert the qualifier string, the triad
keys (rejecting "perks"), registry assignability, and registry/​map completeness.
