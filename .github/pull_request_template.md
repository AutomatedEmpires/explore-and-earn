## Summary

<!-- What does this PR change, and why? One short paragraph. -->

## Source of Truth

- Notion canon:
- Build pack / issue:
- [ ] `canon:cited` applied

## Scope

<!-- What is intentionally inside this PR. -->
-

## Out of Scope

<!-- What this PR deliberately does NOT touch. -->
-

## Files Changed

<!-- Bullet each file + a one-line purpose. -->
-

## Verification Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
# add PR-specific commands here
```

## PR Agent Commands

<!--
Only OWNER / MEMBER / COLLABORATOR comments are routed by the PR agent router.
External routes require the matching *_AGENT_WEBHOOK_URL secret in GitHub Actions.
`@copilot` is special: GitHub owns the actual cloud-agent invocation.
-->

```text
@copilot review this PR for regressions in shell ownership and route chrome
/agent codex review the contracts, types, and test gaps
/agent claude review copy, docs, and product-language drift
/agent sentry review release risk and monitoring impact
/git-agent draft the exact git steps needed to land this PR cleanly
```

## Results

<!-- Paste the actual output / pass-fail of the commands above. -->
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

<!-- If yes: add the matching gate label + `status:needs-founder` and a row in docs/source-of-truth/founder-approval-queue.md. -->

## Next Agent Handoff

<!--
agent:vscode = LOCAL WSL verification on the laptop (the only path to status:verified-local).
agent:copilot-cloud = GitHub-hosted CLOUD reviewer/coding agent, started by an @copilot mention
or automatic Copilot PR review; it CANNOT verify local WSL and status:cloud-reviewed is advisory only.
Do not type @copilot here unless you intend to invoke the cloud agent.
Role-specific handoff templates: docs/agents/handoff-protocol.md.
-->
- **Next agent:** `agent:opus | agent:vscode | agent:copilot-cloud | agent:codex | agent:cursor | agent:claude | agent:review | agent:founder`
- **Required action:**
- **Commands to run:**
  ```bash
  ```
- **Expected output:**
- **Blocking status:** `status:needs-local-verification | status:needs-cloud-review | status:cloud-reviewed | status:needs-review | status:needs-opus-fix | status:needs-founder | status:blocked`
- **If pass:** <e.g. set `status:verified-local`, hand to `agent:review`>
- **If fail:** <e.g. set `status:needs-opus-fix`, hand back to `agent:opus`>

## What Was Intentionally Not Implemented

-

## Known Risks

-

## Follow-up Tasks

- [ ]

---

### Design drift checklist (only if UI is touched)

- [ ] Semantic tokens only (no raw hex / px type / ad-hoc radius)
- [ ] Icons via the Streamline Freehand registry only (G30)
- [ ] Reuses existing `packages/ui` primitives where possible
- [ ] Borders-first; shadows only on overlays
- [ ] Photos framed, never filtered
- [ ] Housing / Meals / Pay triad intact; Verified Host badge present where applicable (G22)
- [ ] No color-only status
