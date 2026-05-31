# Agent Operating Context

The single shared context every agent should load: **where everything lives, the machine, the tooling, and the platform roles.** For *rules*, defer to the Notion canon (Constitution, Orchestration Manual, Canonical Source Registry).

## Platform roles — each platform has one job

| Platform | Its one job | Source of truth for |
| --- | --- | --- |
| **Notion** | Product / planning brain | Decisions, specs, architecture, Build Packs, acceptance criteria, decision log. **Not** where production code is written. |
| **GitHub** | Implementation control plane | Code, issues (task queue), PRs (proposals), Projects (status board), Actions (CI), repo docs. |
| **VS Code + WSL/Ubuntu** | The workshop | Where code is written, run, tested by coding agents. |
| **Figma / FigJam** | Design reference (optional) | Visual exploration. **Not a required gate** — design truth is codified in `docs/design/`. |
| **Canva Pro** | Brand & marketing assets | Social/investor visuals. Never app UI truth. |
| **Supabase** | Database & auth runtime | Postgres, migrations, RLS. Schema truth originates in Notion, implemented here. |
| **Stripe** | Payments runtime | Plans, SKUs, webhooks. Pricing truth lives in Notion. |
| **Vercel** | Hosting / deploy | Where the web app runs. |
| **PostHog / Sentry / Datadog** | Observability | Product analytics / errors / infra. |

**The one rule:** *Notion decides. GitHub builds. Figma shows. Everything else runs.*

## The machine (assume ARM64 + WSL2 — never Intel/x86)

| Layer | Detail |
| --- | --- |
| Device | Lenovo Yoga Slim 7x (Snapdragon X Elite X1E78100, Qualcomm Oryon) — **ARM64** |
| RAM / SSD | 16 GB / 512 GB Samsung NVMe |
| Security | Microsoft Pluton / TPM |
| OS stack | Windows 11 ARM64 → WSL2 Ubuntu 24.04 → VS Code (connected to WSL) → repo |
| Project path | `/home/jackson/automatedempires/ventures/explore-and-earn` |
| Windows/UNC path | `\\wsl.localhost\Ubuntu-24.04\home\jackson\automatedempires\ventures\explore-and-earn` |

## Local tooling (verified inside WSL)

Node.js 24.16.0 · npm 11.16.0 · git · GitHub CLI · Docker + Compose · Playwright · Vercel CLI · Supabase CLI · Stripe CLI · Notion CLI · Cursor · Codex · GitHub Copilot Pro · ChatGPT Pro · Canva Pro · PostHog · Datadog.

> **Node default is 24.16.0** per founder directive. Canon (Agent Runtime Environment) currently says Node 20 LTS + pnpm 9. This drift is tracked in [`../source-of-truth/open-questions.md`](../source-of-truth/open-questions.md). Pin the decision in `.nvmrc` once resolved.

## Local ↔ GitHub sync

The remote (GitHub) and the WSL folder are two copies of the same repo; `git` moves changes on command. Agents working on GitHub: the founder/VS Code agent runs `git pull`. Agents working locally: `git add → commit → push`. The Notion agent can write only to the **GitHub remote** — anything that must *run* (`pnpm install`, `supabase start`, tests) happens locally.

## The agents

| Agent | Role | Writes to |
| --- | --- | --- |
| **Notion Agent (Teach)** | Architect, spec/Build-Pack author, reviewer, orchestrator | Notion + GitHub issues/PRs |
| **VS Code Agent (Copilot/Codex/Cursor/Claude)** | Engineer / implementer / tester | Local repo → GitHub |
| **Figma Agent** | Optional design exploration | Figma + notes back to Notion |
| **GitHub (system)** | The task/PR/review bus | Issues, PRs, Projects, Actions |

**Single-responder principle:** exactly one agent owns a task at a time; ownership is shown by issue/PR assignee + status, never assumed.
