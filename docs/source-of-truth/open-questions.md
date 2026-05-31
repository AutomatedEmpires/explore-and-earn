# Open Questions & Drift Log

Unresolved questions and known drift between canon, machine, and repo. Agents add rows here instead of guessing. Resolved items move to the Notion decision log and may remain here as a closed audit trail until the next docs sweep.

| ID | Question / drift | Context | Owner | Status |
| --- | --- | --- | --- | --- |
| Q-NODE | **Node 20 LTS vs 24.16.0.** Founder directive says default to Node 24.16.0; earlier canon said Node 20 LTS + pnpm 9. | Resolved in Sprint Zero substrate reconciliation: `.nvmrc` pins 24.16.0 and CI uses Node 24.16.0. | Founder | Resolved |
| Q-PKGMGR | **npm vs pnpm + Turborepo.** Repo previously carried an `npm` lockfile while canon targeted pnpm workspaces + Turborepo. | Resolved in Sprint Zero substrate reconciliation: `package-lock.json` removed, `pnpm-lock.yaml` kept canonical, and workspace tooling runs through pnpm + Turbo. | Founder / DevOps | Resolved |
| Q-SUPABASE-CLI | Canon says Supabase CLI 1.x; machine runs 2.102.0. | Update canon to 2.x or pin intentionally. | DevOps | Open |
| Q-AGENTS-DIR | Repo has a `.agents/` role-file convention (empty stubs) alongside the new root `AGENTS.md` standard. | Decide whether `.agents/*.md` role files are kept (and populated) or folded into `docs/agents/`. Root `AGENTS.md` is the agents.md standard and takes precedence for coding agents. | Architect | Open |
| Q-ICON-CAP | Streamline standard license caps usage at ~100 distinct icons / project. | If V1 UI needs >100 distinct icons, an Extended Vector License must be purchased (founder/legal). Track distinct-icon inventory against the cap. | Founder | Open |
| Q-OLD-REPO | Older `exploreandearnv2` repo still exists alongside this clean `explore-and-earn`. | Confirm `explore-and-earn` is canonical; archive the old repo to avoid confusion. | Founder | Open |

## How to use this file

1. Found a conflict or an undecided fork? Add a row — do not silently pick an answer.
2. If the question is high-risk (money/auth/schema/trust/legal/licensing), **also** add it to [`founder-approval-queue.md`](./founder-approval-queue.md).
3. When resolved, record the decision in Notion canon, then strike the row here with a link to the decision.
