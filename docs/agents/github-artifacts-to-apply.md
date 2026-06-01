# GitHub Artifacts to Apply (CLAOS Lite)

This file is the single copy/paste-ready source for the **operational** GitHub artifacts
of the CLAOS Lite relay. The connected agent integration could write *some* of `.github/`
but not `.github/workflows/`, so the workflow file was committed locally and is reproduced
here as the canonical source.

## Application status (what this agent could and could not write)

| Artifact | Location | Status |
| --- | --- | --- |
| PR template | `.github/pull_request_template.md` | ✅ **Written directly** to branch `claos-lite/agent-handoff-relay` (PR #7). |
| Agent verification issue form | `.github/ISSUE_TEMPLATE/agent-verification-task.yml` | ✅ **Written directly** to the same branch. |
| Handoff-helper workflow | `.github/workflows/agent-handoff-helper.yml` | ✅ **Committed on branch** in PR #7. It stays disabled unless `ENABLE_HANDOFF_HELPER == 'true'`. |
| Labels | repo Settings (not a file) | ⚠️ Seed with `gh` from §4 below. Labels live in repo settings, not in committed files. |

> **VS Code / human action required:** run the label seed commands in §4. The workflow,
> PR template, and issue forms are already on the branch. The workflow write limitation
> still explains why the helper was committed locally instead of via the connected app.

The PR template (§1) and issue form (§2) below are summarized so the VS Code agent can
recreate the canonical fields if needed. For the exact committed contents, read the files on
the branch; they already exist there.

> **Two Copilots:** `agent:vscode` = **local WSL** verifier on Jackson's laptop; `agent:copilot-cloud` = GitHub-hosted **cloud** coding agent started by an `@copilot` mention. They are not interchangeable and a cloud run never counts as local verification. See [`agent-roster-and-routing.md`](./agent-roster-and-routing.md) → “Two Copilots” and [`label-system.md`](./label-system.md).

---

## 1. `.github/pull_request_template.md` (canonical summary; already applied)

`````markdown
<!--
CLAOS Lite PR template — Explore&Earn.
Fill every section. This template encodes the agent handoff relay so the founder
never has to write the handoff format by hand.
See docs/agents/claos-lite-handoff-relay.md and docs/agents/handoff-protocol.md.
-->

## Summary

<!-- What does this PR change, and why? One short paragraph. -->

## Source of Truth

- Notion canon:
- Build pack / issue:
- [ ] `canon:cited` applied

## Scope

-

## Out of Scope

-

## Files Changed

-

## Verification Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
```

## Results

- [ ] typecheck passed
- [ ] lint passed
- [ ] build / tests passed (as applicable)

## Risk Level

- [ ] `risk:low`
- [ ] `risk:medium`
- [ ] `risk:high`
- [ ] `risk:approval-required`

## Founder Approval Required?

- [ ] No
- [ ] Yes — gate(s): `money | auth | db-destructive | permissions | trust-safety | legal | asset-license | launch | product-philosophy`

## Next Agent Handoff

- **Next agent:** `agent:opus | agent:vscode | agent:copilot-cloud | agent:codex | agent:cursor | agent:claude | agent:review | agent:founder`
- **Required action:**
- **Commands to run:**
- **Expected output:**
- **Blocking status:** `status:needs-local-verification | status:needs-review | status:needs-opus-fix | status:needs-founder | status:blocked`
- **If pass:**
- **If fail:**

## What Was Intentionally Not Implemented

-

## Known Risks

-

## Follow-up Tasks

- [ ]
`````

> The exact committed file also carries a UI design-drift checklist; the required
> CLAOS Lite sections above are the canonical core. `agent:vscode` is local WSL verification;
> `agent:copilot-cloud` is the GitHub cloud agent and cannot verify local WSL — don't type
> `@copilot` in the handoff unless you intend to invoke the cloud agent.

---

## 2. `.github/ISSUE_TEMPLATE/agent-verification-task.yml` (canonical summary; already applied)

GitHub issue **form** that collects PR number, source branch, requesting agent, next
agent, required verification commands, acceptance criteria, founder-approval flag, risk
level, expected output, and blocking status. Local verification is an `agent:vscode` job
(`gh pr checkout` + pnpm on the laptop); `agent:copilot-cloud` cannot satisfy it.

`````yaml
name: Agent Verification Task
description: Dispatch a local verification task to the next agent (e.g. VS Code / agent:vscode) from a GitHub artifact — not chat.
title: "[verify] PR #<number>: <short summary>"
labels:
  - "agent:vscode"
  - "status:needs-local-verification"
body:
  - type: input
    id: pr-number
    attributes:
      label: PR number
    validations:
      required: true
  - type: input
    id: source-branch
    attributes:
      label: Source branch
    validations:
      required: true
  - type: dropdown
    id: requesting-agent
    attributes:
      label: Requesting agent
      options: ["agent:opus", "agent:vscode", "agent:copilot-cloud", "agent:codex", "agent:cursor", "agent:claude", "agent:review", "agent:founder"]
    validations:
      required: true
  - type: dropdown
    id: next-agent
    attributes:
      label: Next agent
      options: ["agent:vscode", "agent:opus", "agent:copilot-cloud", "agent:codex", "agent:cursor", "agent:claude", "agent:review", "agent:founder"]
    validations:
      required: true
  - type: textarea
    id: verification-commands
    attributes:
      label: Required verification commands
      render: bash
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance criteria
    validations:
      required: true
  - type: dropdown
    id: founder-approval
    attributes:
      label: Founder approval required?
      options: ["No", "Yes"]
    validations:
      required: true
  - type: dropdown
    id: risk-level
    attributes:
      label: Risk level
      options: ["risk:low", "risk:medium", "risk:high", "risk:approval-required"]
    validations:
      required: true
  - type: textarea
    id: expected-output
    attributes:
      label: Expected output
    validations:
      required: true
  - type: dropdown
    id: blocking-status
    attributes:
      label: Blocking status
      options: ["status:needs-local-verification", "status:needs-review", "status:needs-opus-fix", "status:needs-founder", "status:blocked"]
    validations:
      required: true
`````

---

## 3. `.github/workflows/agent-handoff-helper.yml` (already applied; disabled by default)

This file is already committed on the PR branch and is reproduced here as the canonical
copy. It is **disabled/stubbed**: it no-ops unless the repo variable
`ENABLE_HANDOFF_HELPER == 'true'`. It **never** auto-merges, deploys, or modifies anything —
it only posts a reminder comment when a PR is labeled `status:needs-local-verification`. No secrets.

`````yaml
name: Agent Handoff Helper (stub)

# CLAOS Lite — handoff helper.
# SAFETY CONTRACT: NEVER auto-merges, deploys, or modifies production/code/settings.
# Only posts a reminder comment with the local verification checklist when a PR is
# labeled `status:needs-local-verification`.
#
# Ships DISABLED/STUBBED: no-ops unless repo variable ENABLE_HANDOFF_HELPER == 'true'
# (Settings -> Secrets and variables -> Actions -> Variables). No secrets used.

on:
  pull_request_target:
    types: [labeled]

permissions:
  pull-requests: write
  contents: read

jobs:
  remind-local-verification:
    # Stub guard + label guard. BOTH must be true for the job to run.
    if: >-
      vars.ENABLE_HANDOFF_HELPER == 'true' &&
      github.event.label.name == 'status:needs-local-verification'
    runs-on: ubuntu-latest
    steps:
      - name: Post local verification reminder
        uses: actions/github-script@91a83c091797b22c5771b1d7178fd0fddacc73ea
        with:
          script: |
            const body = [
              '### Local verification requested',
              '',
              'This PR is labeled `status:needs-local-verification`. The next agent',
              '(VS Code on WSL) should run:',
              '',
              '```bash',
              'pnpm install',
              'pnpm typecheck',
              'pnpm lint',
              'pnpm build   # if applicable',
              'pnpm test    # if applicable',
              '```',
              '',
              'Then post the Agent Handoff block with results and set:',
              '- `status:verified-local` + `agent:review` if everything passes, or',
              '- `status:needs-opus-fix` + `agent:opus` if something fails.',
              '',
              '_Automated reminder only. Does not merge, deploy, or modify anything._',
            ].join('\n');
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              body,
            });
`````

If you need to recreate the committed file locally, use:

```bash
# from the repo root, on the PR branch
mkdir -p .github/workflows
$EDITOR .github/workflows/agent-handoff-helper.yml   # paste the YAML above
git add .github/workflows/agent-handoff-helper.yml
git commit -m "chore(github): add disabled/stubbed agent-handoff-helper workflow"
git push
```

---

## 4. Label seed commands (run once)

Labels are the relay **baton + routing**. Seed the canonical CLAOS Lite set with `gh`
(`--force` makes re-runs idempotent). Canonical definitions live in
[`label-system.md`](./label-system.md).

```bash
# --- agent (whose turn it is; one at a time) ---
gh label create "agent:opus"          -c 5319E7 -d "Notion/Opus — architect, reviewer, orchestrator" --force
gh label create "agent:vscode"        -c 1D76DB -d "VS Code — LOCAL WSL verification on Jackson's laptop (Copilot-in-editor; durable destination = the environment/role: VS Code). NOT the cloud bot." --force
gh label create "agent:copilot-cloud" -c 8957E5 -d "GitHub-hosted Copilot CLOUD coding agent — started by an @copilot mention in a PR/issue comment. Cannot verify local WSL." --force
gh label create "agent:codex"         -c 0E8A16 -d "Codex — implementation/review" --force
gh label create "agent:cursor"        -c 0E8A16 -d "Cursor — implementation/review" --force
gh label create "agent:claude"        -c 0E8A16 -d "Claude — implementation/review" --force
gh label create "agent:review"        -c FBCA04 -d "Awaiting code review" --force
gh label create "agent:founder"       -c B60205 -d "Human — approval gate / taste / business call" --force

# --- status (the baton; exactly one at a time) ---
gh label create "status:ready"                   -c 0E8A16 -d "Spec-complete; pickable" --force
gh label create "status:claimed"                 -c C2E0C6 -d "An agent has claimed it" --force
gh label create "status:in-progress"             -c FBCA04 -d "Implementation underway on a branch" --force
gh label create "status:needs-local-verification" -c D4C5F9 -d "Awaiting local WSL verification" --force
gh label create "status:verified-local"          -c BFDADC -d "Passed local verification" --force
gh label create "status:needs-opus-fix"          -c D93F0B -d "Sent back to Opus for fixes" --force
gh label create "status:needs-review"            -c 1D76DB -d "Awaiting review" --force
gh label create "status:ready-for-review"        -c 0E8A16 -d "Ready for reviewer" --force
gh label create "status:blocked"                 -c B60205 -d "Blocked by a dependency or conflict" --force
gh label create "status:needs-founder"           -c B60205 -d "Awaiting founder approval gate" --force
gh label create "status:complete"                -c 5319E7 -d "Merged + docs reconciled" --force

# --- area (which part of the system) ---
gh label create "area:sprint-zero"      -c 0052CC -d "Substrate / control plane" --force
gh label create "area:design-system"    -c 0052CC -d "Tokens, primitives, component shells" --force
gh label create "area:contracts"        -c 0052CC -d "packages/contracts types" --force
gh label create "area:ui"               -c 0052CC -d "packages/ui primitives" --force
gh label create "area:database"         -c 0052CC -d "Schema / data dictionary (gated)" --force
gh label create "area:auth"             -c 0052CC -d "Authentication / sessions (gated)" --force
gh label create "area:billing"          -c 0052CC -d "Pricing / Stripe (gated)" --force
gh label create "area:analytics"        -c 0052CC -d "Events / PostHog" --force
gh label create "area:docs"             -c 0E8A16 -d "Documentation / canon" --force
gh label create "area:agent-governance" -c 0052CC -d "Relay, handoff, control-plane process" --force

# --- risk ---
gh label create "risk:low"               -c C2E0C6 -d "Low risk" --force
gh label create "risk:medium"            -c FBCA04 -d "Medium risk" --force
gh label create "risk:high"              -c D93F0B -d "High risk" --force
gh label create "risk:approval-required" -c B60205 -d "Requires founder approval before merge" --force

# --- gate (relay process) ---
gh label create "gate:review"             -c 5319E7 -d "Human review gate" --force
gh label create "gate:test"               -c 1D76DB -d "Must pass CI/tests gate" --force
gh label create "gate:release"            -c B60205 -d "Release/deploy gate (founder only)" --force

# --- gate (founder approval) ---
gh label create "gate:money"              -c B60205 -d "Pricing, plans, SKUs, Stripe, refunds, entitlements" --force
gh label create "gate:auth"               -c B60205 -d "Authentication, sessions, identity, secrets" --force
gh label create "gate:db-destructive"     -c B60205 -d "Schema changes, migrations, RLS, data deletion/drops" --force
gh label create "gate:permissions"        -c B60205 -d "Access control, team scopes, dashboard access" --force
gh label create "gate:trust-safety"       -c B60205 -d "Verified Host integrity, moderation, KYC" --force
gh label create "gate:legal"              -c B60205 -d "Terms, privacy, compliance" --force
gh label create "gate:asset-license"      -c B60205 -d "Paid icon, font, or media licensing" --force
gh label create "gate:launch"             -c B60205 -d "Production launch, public exposure, domain/DNS" --force
gh label create "gate:product-philosophy" -c B60205 -d "Changes to locked principles or the Constitution" --force

# --- governance / freeze ---
gh label create "canon:cited"             -c 0E8A16 -d "Notion canon source cited in the PR" --force
gh label create "blocked:drift"           -c D93F0B -d "Blocked: drifts from canon" --force
gh label create "blocked:conflict"        -c D93F0B -d "Blocked: merge/ownership conflict" --force
gh label create "freeze:all"              -c B60205 -d "Global freeze — do not merge anything" --force
```

---

## 5. Reusable Agent Handoff block

Paste this block as a PR/issue comment (or fill the PR template's **Next Agent Handoff**
section) every time the baton moves. This is what removes the founder as the manual
message bus — the format lives here, not in the founder's head.

```markdown
## Agent Handoff

- **From Agent:**
- **To Agent:**
- **Status:**
- **PR / Branch:**
- **Source of Truth:**
- **What changed:**
- **What needs verification:**
- **Commands to run:**
- **Expected output:**
- **Founder approval required:**
- **Blocked by:**
- **Next step if passed:**
- **Next step if failed:**
```

After posting: swap the `agent:*` label to the new owner and set the new `status:*` label
(exactly one of each at a time).
