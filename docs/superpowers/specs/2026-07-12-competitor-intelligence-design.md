# Explore&Earn Competitor Intelligence Design

Status: approved by the founder continuation brief dated 2026-07-12

## Goal

Add a current, source-cited competitor and market-positioning layer to the existing founding-host acquisition pipeline without restarting or weakening the verified 100-prospect lead set.

## Chosen approach

Use a primary-source market map as the shared evidence layer. Research each platform's public marketing, employer, pricing, safety, and product pages; normalize the findings into `competitor_market_map.csv`; then derive the narrative intelligence, comparison matrix, differentiation, search playbook, query bank, acquisition gap strategy, and founder pitch from those records.

This is preferred to either a prose-only report, which is harder to audit, or a feature-by-feature teardown based on live listings, which would increase copying and access-control risk. It also preserves competitors' real strengths instead of forcing every comparison into a superiority claim.

## Components

1. **Evidence layer:** one CSV row per researched platform, with the exact requested schema, evidence URLs, access date, and confidence score.
2. **Market synthesis:** a long-form intelligence report plus a compact positioning matrix that distinguish observed facts, inferences, unknowns, and recommendations.
3. **Positioning system:** category-specific differentiation centered on seeker-first discovery, Seek / Swipe / Map, the Discovery Card, and explicit Housing / Meals / Pay.
4. **Safe search system:** four category playbooks and a reusable query bank. Competitor results may reveal employer names or terminology, but every prospect must be re-verified on an official employer source before entering the lead pipeline.
5. **Acquisition upgrade:** adjust the first 30 outreach strategy and host-facing copy so the pitch explains practical clarity, host control, and expectations rather than unsupported claims about being better.

## Evidence and safety rules

- Use public, no-login pages and describe features in original language.
- Do not copy or republish listing text, images, compensation, housing, or meal claims.
- Treat unavailable or login-gated features as `unknown`, not `no`.
- Cite public pricing only when the current official source supports it; otherwise record `Not confirmed publicly`.
- Separate paid employment, volunteer exchange, membership, and professional credential marketplaces.
- Do not treat a public phone number as SMS consent or unblock commercial email before the postal-address and suppression gates are satisfied.
- Do not change the 100-lead prospect set unless an independent validation finds a concrete error.

## Validation

- Validate both CSV schemas, row widths, required fields, URLs, date values, score ranges, and uniqueness.
- Verify every competitor row has at least one evidence URL and that narrative tables cite evidence.
- Run a Markdown link check, copied-content risk scan, secret scan if available, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Request an independent final review before committing and pushing the update to draft PR #247.
