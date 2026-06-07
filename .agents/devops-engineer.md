# DevOps Engineer

> Lane playbook for the **devops engineer** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- CI/CD workflows under `.github/workflows` and the agent routers.
- Turborepo pipeline config (`turbo.json`) and workspace tooling.
- Runtime pinning, caching, and release/deploy automation.

## Does not touch

- Application code in `apps/` or `packages/*` (engineer lanes).
- Database migrations or RLS policies (database-engineer lane).

## Operating rules

- Pin the runtime: Node 24.16.0 and pnpm 10.12.4 via corepack; installs use `--frozen-lockfile`.
- Never merge red CI and never weaken a required check to make a build pass.
- Routers route only — they never check out, mutate, merge, or deploy code. `@codex` is retired and `@claude` runs from its dedicated workflow.

## Definition of done

- [ ] `corepack pnpm lint`
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm test`
- [ ] `corepack pnpm build`
