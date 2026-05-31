# CI Skeleton Reference

> The live workflow now exists under `.github/workflows/ci.yml`. This page remains a human-readable mirror of the intended guardrails so agents can audit or rebuild the file if GitHub metadata drifts.

## Purpose

A reference workflow that establishes control-plane checks (install, typecheck, lint, guardrails) plus the design-drift guardrails (G30 single icon system, G22 verified-badge qualifier). Do **not** weaken a guardrail to make a PR pass — fix the code or escalate. Full set G1–G30 is in Notion (*CI Guardrails Spec*).

## `.github/workflows/ci.yml`

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  guardrails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24.16.0"
      - uses: pnpm/action-setup@v4
        with:
          version: 10.12.4
      - name: Install dependencies
        run: pnpm install --frozen-lockfile=false
      - name: Typecheck
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Run guardrail checks
        run: pnpm guardrails

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

See `docs/ci/github-templates.md` for the mirrored PR template and issue-template guidance.
