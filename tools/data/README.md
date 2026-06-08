# `tools/data` — Explore&Earn data readiness tooling

Lane D (data & observability) tooling for confirming and reproducibly populating
business data. See the full runbook: [`docs/runbooks/data-readiness.md`](../../docs/runbooks/data-readiness.md).

| Script                  | Writes?        | Purpose                                                                                                                           |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `verify-data-state.mjs` | No (read-only) | Print row counts for every reference and business-critical table; can gate on emptiness. Safe in any environment, including prod. |
| `seed-demo-data.mjs`    | **Yes**        | Idempotent, **non-prod**, founder-operated demo seed (auth users + profiles + listings + applications).                           |

Both scripts use `@supabase/supabase-js` (a dependency of `@explore-and-earn/web`),
so run them through that workspace:

```bash
# Read-only verification (safe everywhere)
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  pnpm --filter @explore-and-earn/web exec node ../../tools/data/verify-data-state.mjs

# Pre-seed prod safety gate (exit 1 if any business table already has rows)
... node ../../tools/data/verify-data-state.mjs --expect-business-empty
```

The seed script is intentionally hard to run by accident. It requires
`SEED_ALLOW_NONPROD=true`, a `SEED_TARGET_REF` that matches the ref in
`SUPABASE_URL`, and a `--confirm` flag. It is **founder-operated** and is never
run against production by an agent.
