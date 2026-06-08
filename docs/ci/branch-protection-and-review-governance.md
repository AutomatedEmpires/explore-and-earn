# Branch protection & review governance (`main`)

> Status of the real governance gap and the exact admin steps to close it.
> **This change requires repository-admin credentials and could not be executed by the implementation agent — see "Blocker" below.**

## Current state (reality)

- **Required status checks on `main`:** `verify` and `design-guardrails`.
  - `verify` (reusable org workflow `AutomatedEmpires/.github/.github/workflows/reusable-ci.yml@main`) runs `typecheck`, `lint`, `lint:workflows`, `guardrails`, `build`, `test`.
  - `design-guardrails` enforces G30 (single icon system) and G22 (Verified Host badge qualifier).
  - CodeQL and Copilot review also run but are advisory.
- **Required reviews:** **zero.** A PR that is merely green can be merged with **no human approval**.
- **Self-merge:** currently possible — checks gate merges, approvals do not.

**The gap:** "green" is treated as "mergeable." For a repo driven by many parallel automation lanes under a single identity, that means changes can reach `main` with no second set of eyes.

> Note: PR #170 (`align/ci-runtime`) renames the `verify` job to `ci` in `.github/workflows/ci.yml`. If/when that merges, the **required check name must be updated** from `verify` to `ci` or the gate will silently stop matching. This doc and the required-checks list must be reconciled at that time.

## Target state

`main` must require **at least one approving review** in addition to passing checks, the approval must come from someone other than the author, and stale approvals must be dismissed on new pushes. The `migration-guard` check should also be added to required checks.

## Exact admin steps

### Option A — `gh api` (rulesets-free classic branch protection)

Run with an admin token (`repo` + `admin:repo` scope). Adjust the required-checks list to match reality at run time (`verify`/`ci`, `design-guardrails`, `migration-guard`).

```bash
gh api -X PUT repos/AutomatedEmpires/explore-and-earn/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[checks][][context]=verify' \
  -f 'required_status_checks[checks][][context]=design-guardrails' \
  -f 'required_status_checks[checks][][context]=migration-guard' \
  -f 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -F 'required_pull_request_reviews[require_last_push_approval]=true' \
  -F 'enforce_admins=true' \
  -F 'restrictions=null' \
  -F 'required_linear_history=false' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false'
```

Key fields:
- `required_approving_review_count=1` — requires one approval. GitHub already forbids authors from approving their own PR, so this forces a distinct reviewer identity.
- `require_last_push_approval=true` — the approval must come *after* the most recent push, and the user who made that push cannot satisfy it. This is the concrete "cannot be self-approved" control.
- `dismiss_stale_reviews=true` — new commits invalidate prior approvals.
- `enforce_admins=true` — admins cannot bypass. **Founder decision:** if the founder is the only human, leaving this `true` means even founder PRs need a second reviewer; set to `false` only as a deliberate, documented exception.

### Option B — GitHub UI

1. **Settings → Branches → Branch protection rules → Add/Edit rule** for `main`.
2. Enable **Require a pull request before merging** → set **Required approvals = 1**.
3. Enable **Dismiss stale pull request approvals when new commits are pushed**.
4. Enable **Require approval of the most recent reviewable push**.
5. Enable **Require status checks to pass before merging** → add `verify` (or `ci`), `design-guardrails`, `migration-guard`. Keep **Require branches to be up to date** on.
6. Enable **Do not allow bypassing the above settings** (equivalent to `enforce_admins`) per the founder decision above.
7. Save.

### Verifying afterward

```bash
gh api repos/AutomatedEmpires/explore-and-earn/branches/main/protection \
  --jq '{checks: .required_status_checks.checks, reviews: .required_pull_request_reviews}'
```

Expect `required_approving_review_count: 1`, `require_last_push_approval: true`, and the three checks listed.

## Blocker

The implementation agent has **no branch-protection API capability** (the available GitHub tooling exposes file/PR operations only, not `branches/*/protection`). This governance change is therefore **BLOCKED on founder/admin execution**.

**Important constraint to flag:** requiring an approving review implies a **second reviewer identity exists**. If every lane and the founder operate under one account, there is currently no distinct account that can approve. Closing this gap for real requires the founder to either (a) add a second human/collaborator reviewer, or (b) accept that an advisory bot review does not count as an approval and provision a reviewer accordingly. This is a people/access decision, not a code change.
