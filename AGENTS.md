# Explore & Earn — Agent Working Agreement

## ⚠️ Canonical repository (read this first)

**`AutomatedEmpires/explore-and-earn` is the ONE canonical codebase for Explore & Earn.**

Do **NOT** write to **`AutomatedEmpires/exploreandearnv2`**. That repository is
**deprecated and slated for deletion**. It contains an earlier, non-canonical
build. Do not extend it, branch from it, or open PRs against it. If you find
useful work there, port it into this repository instead.

If you are an automated agent: confirm the remote is
`github.com/AutomatedEmpires/explore-and-earn` before making any commit.

## Source of truth

Product, schema, ranking/matching, and discovery specifications live in **Notion**
(Explore & Earn hub → Master Index). Code in this repo must conform to those
canonical specs. When code and spec disagree, the spec wins unless a spec change
is explicitly agreed.

## Working agreement

- All application code lands via **feature branch → pull request → `main`**.
- Keep library modules **pure and dependency-light**; **colocate unit tests**
  (`*.test.ts[x]`) next to the code they cover.
- Database changes are **additive, ordered migrations**; never edit a shipped
  migration in place.
- Prefer small, reviewable PRs with a clear scope boundary and follow-up notes.

## Locked product principles

- Seekers are free forever; hosts pay.
- One canonical `Listing` object across every surface.
- Matching is core infrastructure from day one.
- Discovery is relevant-first, monetized-second (boosted ≈ 15–25% of impressions).
- Stack: Supabase (Postgres + RLS + RPCs) and Stripe.
