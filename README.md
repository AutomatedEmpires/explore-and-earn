# Explore&Earn

> built by seekers for seekers

Explore&Earn is a **built by seekers, for seekers discovery marketplace that rewards real-world exploration.** Every opportunity answers three questions: **Where will I sleep? (Housing) · What will I eat? (Meals) · What will I earn? (Pay).**

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
