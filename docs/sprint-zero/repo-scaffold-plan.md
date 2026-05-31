# Repo Scaffold Plan

> Source of truth: Notion *Repository Mirror Plan* + *Repo Scaffold & Monorepo Layout*. Defines the target monorepo shape. Sprint Zero lands **placeholders**; real implementation follows in scoped PRs.

## Target layout

```
explore-and-earn/
├─ apps/
│  └─ web/                 # Next.js app (placeholder in Sprint Zero)
├─ packages/
│  ├─ ui/                  # design system: tokens, primitives, icons, DiscoveryCard
│  ├─ contracts/           # shared types / zod schemas / API contracts
│  └─ db/                  # db access layer + generated types (no schema yet)
├─ supabase/               # local supabase config + migrations (placeholder)
├─ tools/                  # repo tooling, scripts, codegen (placeholder)
├─ docs/                   # source of truth mirror (this Sprint Zero)
├─ .github/                # PR/issue templates, workflows, CODEOWNERS
├─ AGENTS.md
└─ CLAUDE.md               # imports AGENTS.md
```

## Workspace + tooling decisions

| Topic | Direction | Status |
| --- | --- | --- |
| Package manager | **pnpm workspaces** (proposed) vs current `npm` lockfile | **DECISION PENDING** — Q-PKGMGR / A-PKGMGR |
| Monorepo task runner | **Turborepo** (proposed) | pending package-manager decision |
| Node version | **24.16.0** (founder default) vs `.agents` hints of 20 | **DECISION PENDING** — Q-NODE / A-NODE |
| Web framework | **Next.js** (App Router) | proposed |
| Backend / DB | **Supabase** | proposed (no schema in Sprint Zero) |
| Deploy | **Vercel** | proposed (no deploy in Sprint Zero) |
| Icons | **Streamline Freehand** via registry | locked; license cap pending Q-ICON-CAP |

> **Drift note:** the existing repo uses `npm` (`package-lock.json`) and an `.agents/` directory of empty role stubs. Sprint Zero does **not** delete these; it records the drift in `docs/source-of-truth/open-questions.md` and proposes consolidating on root `AGENTS.md` + `docs/agents/` and (pending approval) pnpm. Do not run destructive cleanup without founder approval.

## Placeholder policy

- Each package/app gets a minimal `package.json` + `README.md` describing intent and "not implemented yet."
- No real schema, migrations, auth, or billing code.
- `packages/ui/src/icons/` ships the **icon registry + placeholder components** (stable names, TODO comments) — no paid Streamline asset files.

## Official docs to confirm before implementation

- pnpm workspaces — https://pnpm.io/workspaces
- Turborepo — https://turborepo.com/docs
- Next.js (App Router) — https://nextjs.org/docs
- Supabase — https://supabase.com/docs
- Vercel — https://vercel.com/docs
- GitHub Actions — https://docs.github.com/actions

Do not hardcode versions in docs without confirming against these.
