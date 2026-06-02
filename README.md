# Explore&Earn

[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/AutomatedEmpires/explore-and-earn?utm_source=oss&utm_medium=github&utm_campaign=AutomatedEmpires%2Fexplore-and-earn&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![Phase: Sprint Zero](https://img.shields.io/badge/phase-Sprint%20Zero-CB6E17?style=flat-square)](./docs/sprint-zero/sprint-zero-build-pack.md)
[![Hosting: Vercel](https://img.shields.io/badge/hosting-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/docs)
[![Analytics: PostHog](https://img.shields.io/badge/analytics-PostHog-FF6D2D?style=flat-square&logo=posthog&logoColor=white)](https://posthog.com)
[![Backend: Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/docs)

> built by seekers for seekers

Explore&Earn is a **mobile-first, lifestyle-driven opportunity marketplace** — not a generic job board. Every opportunity answers three questions: **Where will I sleep? (Housing) · What will I eat? (Meals) · What will I earn? (Pay).**

This repository is the **implementation control plane**. The product brain lives in Notion. Design truth is codified here in `docs/design/` (Figma is an optional reference, not a required gate).

## Start here

| If you are… | Read this first |
| --- | --- |
| **Any agent (Copilot / Codex / Cursor / Claude)** | [`AGENTS.md`](./AGENTS.md) |
| Understanding how work flows between agents | [`docs/agents/cross-agent-workflow.md`](./docs/agents/cross-agent-workflow.md) |
| Building UI | [`docs/design/design-system-v1.md`](./docs/design/design-system-v1.md) |
| Building the core card | [`docs/design/discovery-card-v1.md`](./docs/design/discovery-card-v1.md) |
| Knowing what NOT to build yet | [`docs/sprint-zero/sprint-zero-build-pack.md`](./docs/sprint-zero/sprint-zero-build-pack.md) |

## Repository map

```
AGENTS.md                      # README for coding agents (read first)
CLAUDE.md                      # imports AGENTS.md for Claude
docs/
  agents/                      # how agents operate + hand off work
  source-of-truth/             # Notion -> repo canon mirror, open questions, approval queue
  sprint-zero/                 # current phase: build pack, scaffold plan, acceptance criteria
  design/                      # codified design system (tokens, cards, icons, photo, motion)
  product/                     # product principles + primitive specs
apps/web/                      # Next.js app (placeholder shell in Sprint Zero)
packages/ui/                   # shared component + icon registry
packages/contracts/            # shared TypeScript contracts (placeholder)
packages/db/                   # database client + types (placeholder)
supabase/                      # Supabase project (placeholder in Sprint Zero)
tools/                         # repo tooling / automation
```

## Current phase: **Sprint Zero**

Sprint Zero establishes the *control plane* (agent context, source-of-truth mirror, design foundation, CI guardrail skeletons) so future agents can build safely. **No production features yet** — see the forbidden list in [`AGENTS.md`](./AGENTS.md).

## Build environment (canonical)

Windows 11 ARM64 → WSL2 Ubuntu 24.04 → VS Code → `/home/jackson/automatedempires/ventures/explore-and-earn`. Node 24.16.0 default. See [`docs/agents/agent-operating-context.md`](./docs/agents/agent-operating-context.md) for the full machine + tooling context.
