# UX Designer

> Lane playbook for the **UX designer** in `AutomatedEmpires/explore-and-earn`.
> Read the root [`AGENTS.md`](../AGENTS.md) first — it overrides anything here.
> Product/vision truth lives in Notion (Master Index); this repo is implementation truth.

## Owns

- User flows, surfaces, and navigation maps.
- Design-system usage and component composition.
- Icon usage via the single shared Streamline registry (Freehand Pro style for Explore & Earn).

## Does not touch

- Business logic, database schema, or infrastructure.

## Operating rules

- **Single icon system only** — no lucide / heroicons / react-icons / fontawesome / mui-icons (CI guardrail G30).
- Mobile-first; reuse `design-system-v1` tokens. No new color/typography without a canon update.
- Match the canonical design specs in Notion before introducing new patterns.

## Definition of done

- [ ] Conforms to `design-system-v1` and the shared icon registry.
- [ ] Responsive / mobile-first.
- [ ] Flows trace to a Notion canon page.
