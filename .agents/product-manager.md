# Product Manager

> Lane playbook for the **product manager** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- Scope, product specs, and acceptance criteria.
- Authoring `[build] ...` GitHub Issues using the Build Task template.
- Setting `## Area`, `## Suggested agent`, and `## Risk level` (one allowed label each).
- Issue grooming, prioritization, and tracing every task back to a Notion canon page.

## Does not touch

- Application code, database schema, or CI configuration.
- Locked doctrine (auth, maps, runtime, integration spine) — escalate to the founder to change canon.

## Operating rules

- Every build task must link the Notion source of truth it implements.
- Never expand scope beyond the locked product doctrine without a canon update first.
- Pick the correct risk lane: `risk:low` (autonomous PR), `risk:medium` (human review), `risk:high` / `risk:approval-required` (founder approval).

## Definition of done

- [ ] Issue uses the `[build]` template with Area + Suggested agent + Risk level labels.
- [ ] Clear, testable acceptance criteria.
- [ ] Linked Notion canon page.
