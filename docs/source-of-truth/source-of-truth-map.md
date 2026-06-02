# Source-of-Truth Map

This file tells any agent **where truth lives** and **which way it flows**. The canonical product brain is Notion; this repo mirrors the slices agents need at build time so they never have to open Notion to do their job.

## Direction of truth

```
Notion (product truth)  ->  repo docs (build-time mirror)  ->  code
        ^                                                       |
        |________ reconcile if code diverges from canon ________|
```

- **Product decisions, specs, pricing, schema intent, matching rules** originate in **Notion**.
- **What the code currently does** is the truth of the **repo**.
- If they disagree: Notion wins for *product truth*; repo wins for *current behavior*. The gap is a bug to reconcile — log it in [`open-questions.md`](./open-questions.md).

## Canonical Notion spine (read order for new agents)

These are the top-level canon documents. The repo mirrors the build-relevant parts; Notion remains authoritative.

| # | Canon document (Notion) | Mirrored here as |
| --- | --- | --- |
| 1 | Explore&Earn Constitution — Immutable Product Truths | `docs/product/product-principles.md` |
| 2 | Source of Truth — Master Index | this map + `docs/source-of-truth/master-index-inventory.md` |
| 3 | Build Context & Cross-Agent Operating Model | `docs/agents/*` |
| 4 | Agentic Orchestration Manual / Agent Roles & Orchestration Map | `docs/agents/cross-agent-workflow.md`, `handoff-protocol.md` |
| 5 | Canonical Source Registry & Drift Control System | `docs/source-of-truth/canon-registry.md` |
| 6 | Design Tokens & Visual System — V1 | `docs/design/design-system-v1.md` |
| 7 | Canonical Card System Specification | `docs/design/discovery-card-v1.md`, `docs/product/discovery-card-v1.md` |
| 8 | Icon & Element System — Streamline Freehand (Locked) | `docs/design/icon-system.md`, `streamline-freehand-map.md` |
| 9 | Open Questions & Decision Log | `docs/source-of-truth/open-questions.md` |

## What is mirrored vs linked

- **Mirrored** (lives in repo, agents build from it directly): design tokens, card spec, icon registry, build order, acceptance criteria, agent workflow, forbidden actions.
- **Linked** (stays in Notion, repo points to it): full schema/data dictionary, pricing/SKUs, matching formula, legal/policy, analytics taxonomy. These are gated and change-controlled; do not duplicate their detail into the repo without a Build Pack.

## Drift rules

1. A repo doc that encodes a product decision must name its Notion source.
2. If you change behavior that contradicts a mirrored doc, update the doc in the same PR.
3. If you cannot reconcile, add an entry to `open-questions.md` and do not mark the task `done`.
