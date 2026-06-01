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
| Q-MATCH-EVENT-SHORTLIST | Directive analytics event `candidate_shortlisted` uses prohibited "shortlisted" term. | Resolved 2026-05-31 (ADR-0001 §16): retired in favor of `candidate_saved` (mirrors `saved_by_host`). Added to `matching-events.ts`. **Canon-sync owed:** mirror into Notion Event Registry. | Architect / Founder | Resolved (canon-sync owed) |
| Q-MATCH-EVENT-ADDS | Directive UI events `candidate_card_opened`, `candidate_profile_popup_opened`, `quick_apply_clicked` are not in the Canonical Event Registry. | Resolved 2026-05-31: adopted for V1 instrumentation (IDs only) plus passive `match_score_impression`. Added to `matching-events.ts`. **Canon-sync owed:** mirror into Notion Event Registry. | Architect | Resolved (canon-sync owed) |
| Q-MATCH-BANDS | Match band labels + numeric thresholds undefined. | Resolved 2026-05-31 (ADR-0001 §6): Strong 75-100 / Developing 50-74 / Needs attention 0-49. | Founder | Resolved |
| Q-INVITE-SPAM | Anti-spam invite caps (per-host / per-seeker) undefined. | Resolved 2026-05-31 (ADR-0001 §8): 1/host-seeker-listing, 2 concurrent, 3/30d, 50/day host, 10/day seeker; credit restored only before delivery. | Founder | Resolved |
| Q-MATCH-STALE-DISPLAY | Display rule for stale-but-shown match results + minimum confidence display threshold undefined. | Resolved 2026-05-31 (ADR-0001 §7): withhold <40, qualify 40-59, full >=60; stale-but-shown shows last band + "Refreshing" unless a high-impact input changed (then "Updating match"). | Founder / Architect | Resolved |
| Q-HOST-NOTES | Whether host private notes ship in V1 candidate review. | Resolved 2026-05-31: **deferred to V2.** V1 review surface stays disposition-only (saved/skipped/invited/offered/not_selected). Avoids extra RLS surface in V1. | Founder | Resolved (deferred V2) |
| Q-INACTIVITY-CURVE | Inactivity cold-start window + recovery curve undefined. | Resolved 2026-05-31 (ADR-0001 §5): 14d + 3-opportunity grace; recency 3.0/2.0/1.0/0.5 floor; response-rate max 2 after >=5 sample/90d; recoverable. | Founder | Resolved |
| Q-ROLE-ACTIONS | Exact host team-role -> review-action permissions. | Resolved 2026-05-31: mapping locked in `host-candidate-review-v1.md` (owner/admin full; hiring_manager save/invite/offer/not_select; analyst read-only; billing none on candidates; viewer read-only). Confirm against Permission/Visibility/RLS Registry at implementation. | Architect | Resolved (confirm vs RLS registry) |
| Q-CANON-SYNC-MATCH | Locked tuning (ADR-0001) + new events must be mirrored back into Notion canon (Event Registry, Ranking Formula sub-weights, Lifecycle/Notification specs). | New 2026-05-31. Repo leads canon for this batch under founder authorization; Notion must be updated to stay source-of-truth. | Architect / Founder | Open |

## How to use this file

1. Found a conflict or an undecided fork? Add a row — do not silently pick an answer.
2. If the question is high-risk (money/auth/schema/trust/legal/licensing), **also** add it to [`founder-approval-queue.md`](./founder-approval-queue.md).
3. When resolved, record the decision in Notion canon, then strike the row here with a link to the decision.
