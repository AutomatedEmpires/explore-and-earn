# Canon Registry (repo mirror)

A lightweight registry of the canonical decisions agents must respect. The authoritative registry is the Notion **Canonical Source Registry & Drift Control System**; this is the build-time mirror. Each row points to where the rule is enforced.

## Locked decisions (do not contradict without a founder gate)

| ID | Decision | Status | Enforced by |
| --- | --- | --- | --- |
| C-VISION | Explore&Earn is a built by seekers, for seekers discovery marketplace that rewards real-world exploration | Locked | `docs/product/product-principles.md` |
| C-TRIAD | Every opportunity surfaces HOUSING / MEALS / PAY as a first-class triad (never "Perks") | Locked | `docs/design/discovery-card-v1.md` |
| C-CARD | One unified card system across all categories; vary imagery/accent, not the system | Locked | `docs/design/discovery-card-v1.md` |
| C-SEEKERS-FREE | Seekers are free forever; hosts pay for access/visibility/analytics/recruiting | Locked | Notion: Monetization Strategy |
| C-TRUST-FIRST | Discovery stays seeker-trust-first; boost increases exposure, never fakes match quality | Locked | Notion: Discovery & Boosting |
| C-VERIFIED | Verified Host badge is mandatory and is **self-declared** in V1 | Locked | `docs/design/discovery-card-v1.md` (G22) |
| C-ICONS | Single icon system: Streamline Freehand, via one registry; no other icon libs | Locked (2026-05-31) | `docs/design/icon-system.md` (G30) |
| C-TOKENS | V1 design tokens (type/color/spacing/radius/elevation/motion) are locked | Locked (2026-05-30) | `docs/design/design-system-v1.md` |
| C-PHOTO | Hand-drawn frame + paper mat AROUND photos; never filters ON host photos | Locked | `docs/design/photo-language.md` |
| C-BUILD-ORDER | Sprint Zero → Design System V1 → Discovery Card V1 → DB V1 → features | Locked | `docs/sprint-zero/sprint-zero-build-pack.md` |
| C-FIGMA-OPTIONAL | Figma is an optional visual reference, not a required gate | Locked (2026-05-31) | `AGENTS.md` |

## CI guardrails referenced by canon

| Guardrail | Rule |
| --- | --- |
| **G22** | A listing/host Verified badge must render the "Self-Declared by Host" qualifier |
| **G30** | Single icon system (Streamline Freehand); ban other icon-library imports + ad-hoc inline SVG in feature code |

The full guardrail set (G1–G30) is specified in Notion (*CI Guardrails Spec — Drift Prevention Checks*). Sprint Zero ships skeletons in `.github/workflows/`; the full set is implemented incrementally.

## How to add a row

New canon enters via Notion first (decision logged), then is mirrored here in the same PR that relies on it. Never invent a locked decision in the repo — escalate via `open-questions.md` or `founder-approval-queue.md`.
