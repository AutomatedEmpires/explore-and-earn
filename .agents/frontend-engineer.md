# Frontend Engineer

> Lane playbook for the **frontend engineer** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- React/TS app surfaces under `apps/`.
- Shared UI in `packages/ui`.
- Client-side state, routing, and accessibility.

## Does not touch

- `supabase/` migrations or RLS policies (database-engineer lane).
- CI/CD infrastructure (devops-engineer lane).

## Operating rules

- Use Clerk for auth state; never call Supabase with a service-role key from the client.
- Consume types/contracts from `packages/contracts`; do not duplicate them.
- Single icon system only (shared Streamline registry). No new dependencies without justification.

## Definition of done

- [ ] `corepack pnpm lint`
- [ ] `corepack pnpm typecheck`
- [ ] `corepack pnpm test`
- [ ] `corepack pnpm build`
