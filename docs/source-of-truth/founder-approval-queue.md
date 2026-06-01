# Founder Approval Queue

> Items that require **Caveman (founder)** ratification before they can leave DRAFT and influence real migrations, pricing, auth, or enforcement. Anything here is also tagged with the `needs-founder` label on the relevant PR. Backend architect proposes with justification; founder decides.

## How to use
- Each item: ID, what is proposed, why, default-if-unanswered, and blast radius.
- “Default-if-unanswered” is the conservative behavior the build assumes until ratified, chosen to be reversible.

## Open items (from Backend Build Pack v1 / DR-B series)

| ID | Proposal | Why it needs founder | Default until ratified | Blast radius |
|---|---|---|---|---|
| FQ-1 (DR-B5) | Team roles = `owner/admin/hiring_manager/analyst/billing/viewer`; retire legacy `recruiter/listing_manager/marketing` | Permission model is canon; renaming roles touches every RLS policy | Map legacy->new at the seam; do not delete legacy labels yet | RLS, seed, UI role pickers |
| FQ-2 (DR-B6) | Add `listings.mix_domains text[]`; `mix` = category-only match, no multi-category score bonus | New persisted field + ranking semantics; could be gamed | mix capped at category-only tier; field proposed, not created | schema, matching, discovery |
| FQ-3 (DR-B9) | Production auth = Supabase email + magic link first; OAuth deferred; roles read by RLS not JWT | Auth wiring is a security decision; affects every protected route | keep auth in draft; no prod auth wired | auth, RLS, all routes |
| FQ-4 | First-listing publish goes `under_review`; subsequent listings `live` immediately | Moderation posture / trust tradeoff | first listing under_review, rest live | publish route, moderation queue |
| FQ-5 | `match_score` exposure to logged-out users on `GET /api/listings` | Privacy + scraping surface | login required to see score | listings route, discovery |
| FQ-6 | Founding `seats_total` cap value + founding price points (14900/29900/59900) vs ADR-028 | Money + scarcity are founder-locked | do not seed; leave TODO | founding program, Stripe seed |
| FQ-7 | Observability vendors (PostHog + Sentry) | Cost + data-processing agreement | proposal only; no SDK wired | analytics, error reporting |

## Standing gates (always require founder/ops sign-off)
- Executing any migration against a real database.
- Enabling RLS on a live project.
- Adding Stripe **live** keys or creating live products/prices.
- Versioning or changing the host attestation policy copy.
- Changing any Founder Locked Pricing or add-on price constant.

## Resolved (moved out of queue)
- _none yet — all DR-B decisions are recorded in `docs/architecture/backend-decisions-v1.md`; the rows above are the subset still needing an explicit founder yes/no._
