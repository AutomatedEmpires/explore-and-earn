# Design Drift Prevention

How we keep the UI from sliding into generic, ugly, default SaaS over time. Drift is the founder's #1 visual concern; these rules are enforced by review + CI guardrails.

## The rules

1. **Tokens only.** No raw hex, px type sizes, or ad-hoc radii in feature code. Use semantic tokens from `packages/ui` / `tokens.css`. (See `design-system-v1.md`.)
2. **One icon system.** Streamline Freehand via the `<Icon name="domain.name"/>` registry only. No Lucide/Heroicons/Font Awesome/Material/react-icons; no ad-hoc inline SVG in feature code. (CI **G30**.)
3. **One component system.** All categories share the same components; vary imagery + accent, never fork the system per category or per dashboard.
4. **Borders-first, not shadow-first.** Cards/rows use hand-drawn ink borders and **no** shadow; shadows are reserved for overlays.
5. **Frame, not filter, on photos.** Never mutate host photos; frame around them. (See `photo-language.md`.)
6. **The triad is sacred.** HOUSING / MEALS / PAY are always first-class; never "Perks."
7. **Verified Host badge is mandatory** and carries the self-declared qualifier. (CI **G22**.)
8. **No color-only status.** Always icon + text + (optional) color.
9. **Reuse before create.** Check `packages/ui` for an existing primitive before building a new one. New primitives need a short rationale in the PR.
10. **Cite canon.** Any PR encoding a visual/product decision links the Notion source or the relevant `docs/design/` file.

## CI guardrails (skeletons in Sprint Zero; full set incremental)

| Guardrail | Checks |
| --- | --- |
| **G30** | Bans non-Streamline icon-library imports + ad-hoc inline `<svg>` in `apps/**`, `packages/**` feature code |
| **G22** | Verified badge component must render the "Self-Declared by Host" qualifier |
| (planned) raw-hex check | Flags raw hex / px font-size in feature code outside the token layer |
| (planned) component-reuse check | Flags duplicate primitives that should live in `packages/ui` |

The full guardrail set (G1–G30) is specified in Notion (*CI Guardrails Spec — Drift Prevention Checks*). Implement incrementally; never weaken a guardrail to make a PR pass — fix the code or escalate.

## Review checklist (paste into PRs that touch UI)

- [ ] Uses semantic tokens only (no raw hex/px type/ad-hoc radius).
- [ ] Icons via the Streamline registry only.
- [ ] Reuses existing `packages/ui` primitives where possible.
- [ ] Borders-first; shadows only on overlays.
- [ ] Photos framed, never filtered.
- [ ] Triad intact; Verified badge present where applicable.
- [ ] No color-only status.
- [ ] Links the canon source for any product/visual decision.
