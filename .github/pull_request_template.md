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

<!-- agent:vscode = LOCAL WSL verification on the laptop. agent:copilot-cloud = GitHub-hosted cloud coding agent, started by an @copilot mention; it CANNOT verify local WSL. Do not type @copilot here unless you intend to invoke the cloud agent. -->
- **Next agent:** `agent:opus | agent:vscode | agent:copilot-cloud | agent:codex | agent:cursor | agent:claude | agent:review | agent:founder`
- **Required action:**
- **Commands to run:**
  ```bash
  ```
- **Expected output:**
- **Blocking status:** `status:needs-local-verification | status:needs-review | status:needs-opus-fix | status:needs-founder | status:blocked`
- **If pass:** <e.g. set `status:verified-local`, hand to `agent:review`>
- **If fail:** <e.g. set `status:needs-opus-fix`, hand back to `agent:opus` with notes>

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
