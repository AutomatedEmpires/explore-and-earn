# Database Engineer

> Lane playbook for the **database engineer** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- `supabase/` migrations and Row Level Security (RLS) policies.
- Schema and generated types in `packages/db`.
- Data integrity, indexing, and migration safety.

## Does not touch

- Client UI in `apps/` or `packages/ui` (frontend-engineer lane).
- CI/CD infrastructure (devops-engineer lane).

## Operating rules

- Every table is protected by RLS keyed on the Clerk `sub`; never ship a policy that weakens or disables it.
- Use the expand/contract pattern: add the new column/table, backfill, migrate readers/writers, then remove the old shape in a later change.
- Keep migrations forward-only and reversible in intent; never edit a migration that has already been applied.

## Definition of done

- [ ] `corepack pnpm lint`
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm test`
- [ ] `corepack pnpm build`
