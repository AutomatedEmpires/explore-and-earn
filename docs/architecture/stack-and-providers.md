# Explore & Earn — Stack & Provider Manifest

> **Source of truth:** Notion canon — "Locked Architecture Partners & Integration
> Decisions" and "Agent Runtime Environment". This file is a committed **mirror** so
> coding agents (Copilot, Claude/Scout, Codex) can read the locked stack directly
> from the repo. If this file and Notion ever disagree, **Notion wins** — open a PR
> to reconcile.
>
> Operating model: **Notion decides · GitHub builds · Figma shows · everything else runs.**

## Locked providers (V1)

| Layer | Provider | Status |
|---|---|---|
| App framework | Next.js + React | Locked |
| Hosting / deploy | Vercel | Locked (initial) |
| Database | PostgreSQL | Locked |
| Backend platform | Supabase (Postgres + Storage + Realtime — **DB/storage only**) | Locked direction |
| Auth | **Clerk** (cross-app standard, locked 2026-06-04) | Locked |
| Payments / billing | Stripe (test mode until go-live) | Locked |
| Maps / geo | **Mapbox** (cross-app standard, locked 2026-06-04) | Locked |
| Product analytics | PostHog | Locked |
| Error monitoring | Sentry | Locked |
| Transactional email | Resend | Locked |
| Public image delivery | Cloudinary | Locked (2026-06-01) |
| Private / protected media | Supabase Storage | Reserved (later phase) |
| Search | PostgreSQL full-text (pgvector later if needed) | Locked (initial) |
| Secrets manager | Doppler | Locked (2026-06-01) |
| Design | Figma | Locked |
| Docs / source of truth | Notion | Locked |

> **Migration note (2026-06-04):** Auth migrated from Supabase Auth → **Clerk**; maps
> migrated from Azure Maps → **Mapbox**. Supabase is retained for Postgres + Storage only.
> See issue #91 and `docs/AGENT-ALIGNMENT-NOTES.md`.

## Not locked yet (do not assume)

- Feature flags (PostHog flags vs ConfigCat vs DevCycle — deferred)
- Content moderation provider (candidate: Azure AI Content Safety — **not** locked; needs hardening)
- Redis, Kubernetes, Elasticsearch, GraphQL, dedicated vector DB, external calendar sync,
  enterprise SSO, dedicated search service, external CMS — all deferred until the V1 loops are proven.

## Secrets — how they flow

- **Doppler is the upstream source of truth** for every environment (dev / staging / prod).
- Doppler **syncs** secrets into local dev, GitHub Actions CI, and Vercel — no manual copy-paste.
- Local dev materializes to `~/.config/explore-and-earn/.env.local` (mode 600) via the Doppler CLI
  (`doppler run -- <cmd>` or `doppler secrets download`). `.env*` is **never** committed.
- See [`.env.example`](../../.env.example) at the repo root for the required key names (names only, no values).
- 1Password / Bitwarden hold only the Doppler admin credential as break-glass backup.

## CLIs / runtime

Node 24.16.0 (via nvm) · pnpm (corepack-managed) · Supabase CLI · Stripe CLI · Vercel CLI ·
GitHub CLI · Doppler CLI · Docker (local Supabase stack). Locked tool versions live in the
Agent Runtime Environment canon.
