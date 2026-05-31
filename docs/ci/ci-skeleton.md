# CI Skeleton (to be added as `.github/workflows/ci.yml` by a human)

> **Why this lives in docs:** the agent integration is blocked from writing under `.github/` (GitHub returns 403 "Resource not accessible by integration" — the connected GitHub app lacks the `workflows` / `.github` write scope). A human with the right scope, or `gh` locally, should create the files described here. The PR/issue templates and `ci.yml` are specified in this folder so nothing is lost.

## Purpose

A SKELETON that establishes control-plane checks (lint/typecheck/test placeholders) and the design-drift guardrails (G30 single icon system, G22 verified-badge qualifier). Steps no-op gracefully until tooling lands. Do **not** weaken a guardrail to make a PR pass — fix the code or escalate. Full set G1–G30 is in Notion (*CI Guardrails Spec*).

## `.github/workflows/ci.yml`

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-checks:
    name: lint / typecheck / test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          # Founder default runtime; see docs/agents/agent-operating-context.md (Q-NODE pending).
          node-version: "24.16.0"
      - name: Install (placeholder)
        run: echo "TODO: install once package manager is locked (Q-PKGMGR / A-PKGMGR)"
      - name: Lint (placeholder)
        run: echo "TODO: wire lint once tooling lands"
      - name: Typecheck (placeholder)
        run: echo "TODO: wire typecheck once TS config lands"
      - name: Test (placeholder)
        run: echo "TODO: wire tests once packages land"

  design-guardrails:
    name: design drift guardrails
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: G30 — single icon system (Streamline Freehand registry only)
        shell: bash
        run: |
          set -euo pipefail
          echo "G30: scanning for banned icon libraries + ad-hoc inline SVG in feature code..."
          PATTERN='from "(lucide-react|@heroicons|react-icons|@fortawesome|@mui/icons-material)"'
          if grep -REn "$PATTERN" apps packages 2>/dev/null | grep -v 'packages/ui/src/icons'; then
            echo "::error::G30 violation — use the Streamline Freehand icon registry (packages/ui/src/icons), not another icon library."
            exit 1
          fi
          echo "G30 OK (no source dirs yet, or no violations)."
      - name: G22 — Verified Host badge carries self-declared qualifier
        shell: bash
        run: |
          set -euo pipefail
          echo "G22: verifying VerifiedHost badge includes the self-declared qualifier..."
          if grep -REl 'VerifiedHostBadge' packages apps 2>/dev/null | grep -q .; then
            if ! grep -REq 'Self-Declared' packages apps 2>/dev/null; then
              echo "::error::G22 violation — Verified Host badge must display the 'Self-Declared by Host' qualifier."
              exit 1
            fi
          fi
          echo "G22 OK (badge not implemented yet, or qualifier present)."
```

## `.github/pull_request_template.md`

See `docs/ci/github-templates.md` for the PR template, issue templates, and ISSUE_TEMPLATE config. They must be added manually for the same scope reason.

## How to add locally

```bash
# from the repo root, on the sprint-zero branch
mkdir -p .github/workflows .github/ISSUE_TEMPLATE
# create the files from docs/ci/ci-skeleton.md and docs/ci/github-templates.md
git add .github
git commit -m "ci: add Sprint Zero CI skeleton + PR/issue templates (G30, G22 guardrails)"
git push
```
