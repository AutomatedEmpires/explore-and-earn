# Notion Worker Rollout Risks

This file is the durable repo-side review artifact for the Notion dispatcher and reconciler workers. It records the remaining operational risks after the current hardening pass so future agents do not rediscover them from scratch.

## What is now covered

- Notion `ready` tasks dispatch to GitHub issues on a one-minute loop.
- Dispatch dedupe is ledger-first through persisted sync state keyed by Notion page ID.
- Founder gates map to real GitHub labels and remove the ready label when blocked.
- A second one-minute reconciler updates Notion from GitHub issue and PR state.
- Reconciliation writes PR URL/number, sync timestamps, and sync errors when matching Notion properties exist.

## Remaining risks

1. PR linkage depends on GitHub issue timeline cross-references. If a PR is opened without linking the issue, the reconciler will not discover it.
2. Review-state reconciliation only looks at the latest non-comment review. It does not inspect check runs, required approvals, or branch protection.
3. The worker is poll-based, not webhook-based. State converges within about a minute, not instantly.
4. Optional Notion properties still control write-back visibility. Missing PR or sync-error properties do not break the worker, but they reduce operational observability.
5. Founder-blocked issues stay blocked until canon and GitHub labels are explicitly changed. The worker does not auto-clear a gate from prose alone.
6. Closed issues without a merged PR are treated conservatively. The reconciler records them as `closed` and avoids forcing a Notion terminal state.

## Operator checks before climbing autonomy

1. Confirm PR templates and agents always link the issue so timeline-based PR discovery is reliable.
2. Add repo observability for GitHub API rate limits, repeated reconcile errors, and sync lag.
3. Decide whether `closed` should become a first-class Notion lifecycle state or remain a manual exception.
4. Decide whether CI/check-run state should feed Notion before moving past guarded rung 2 automation.