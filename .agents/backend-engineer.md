# Backend Engineer

> Lane playbook for the **backend engineer** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- Server-side logic, API routes, and Supabase edge functions.
- Shared contracts/types in `packages/contracts`.
- Integration glue to Stripe, Clerk, and other backend services.

## Does not touch

- Client UI in `apps/` or `packages/ui` (frontend-engineer lane).
- Migrations and RLS policy definitions (database-engineer lane) — coordinate, don't author.
- CI/CD infrastructure (devops-engineer lane).

## Operating rules

- All data access is authorized through RLS keyed on the Clerk `sub`; never bypass it with a service-role key in request paths.
- Follow the expand/contract pattern for any schema-dependent change; ship the additive step before removing the old path.
- Own the contract: publish types in `packages/contracts` and never weaken auth or validation to make a test pass.

## Definition of done

- [ ] `corepack pnpm lint`
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm test`
- [ ] `corepack pnpm build`
