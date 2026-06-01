# Guardrail Test Plan — V1 (DRAFT, review-only)

> Maps the canon **CI Guardrails Spec (G1–G30)** to concrete test files, layers, and example assertions so coding agents can wire CI *before* feature work. This is a plan, not wired CI. `.github/workflows/` is intentionally untouched here (writes to it are blocked and it is founder-gated).

## CI job order (from canon spec)
```
lint  ->  typecheck  ->  unit  ->  db:assert  ->  rls:test  ->  e2e:guardrails
```
A PR cannot merge to `main` unless the `guardrails` job is green.

## G-rule -> test artifact map

<table header-row="true">
<tr><td>ID</td><td>Layer</td><td>Test artifact (proposed path)</td><td>Core assertion</td></tr>
<tr><td>G1</td><td>lint+unit</td><td>eslint no-pricing-literals; packages/contracts/__tests__/pricing.test.ts</td><td>no banned price literals outside contracts; starter.monthly===19900</td></tr>
<tr><td>G2</td><td>rls+unit</td><td>supabase/tests/attestation.rls.test; services/host/__tests__/attestation.test.ts</td><td>RPC inserts host_attestations row w/ policy_version; direct update denied</td></tr>
<tr><td>G3</td><td>db+grep</td><td>ci/db-assert/verified-status.sql; ci/grep-retired.sh</td><td>column verified_status absent; zero source matches</td></tr>
<tr><td>G4</td><td>lint+e2e</td><td>eslint no-seeker-paywall; e2e/seeker-no-paywall.spec.ts</td><td>no paywall in seeker scope DOM; no audience='seeker' Stripe product</td></tr>
<tr><td>G5</td><td>lint+unit</td><td>eslint no-direct-stripe-refund</td><td>stripe.refunds.create only in services/refund-review/</td></tr>
<tr><td>G6</td><td>lint+db</td><td>ci/grep-retired.sh; db-assert/no-accepted-role.sql</td><td>no accepted_role token; no accepted_roles table/enum</td></tr>
<tr><td>G7</td><td>db</td><td>db-assert/no-category-tables.sql</td><td>zero tables matching '_listings$'</td></tr>
<tr><td>G8</td><td>unit+lint</td><td>services/matching/__tests__/score.invariance.test.ts; eslint no-monetization-in-match</td><td>identical match_score across plan tiers; no pricing import in matching/</td></tr>
<tr><td>G9</td><td>lint+e2e</td><td>eslint no-external-calendar-sync</td><td>no calendar SDK import; no Connect-Calendar CTA</td></tr>
<tr><td>G10</td><td>rls+e2e</td><td>supabase/tests/media-public.rls.test; e2e/pending-media.spec.ts</td><td>public reads only approved media</td></tr>
<tr><td>G11</td><td>lint+e2e</td><td>eslint no-trust-score-in-public-dto</td><td>trust_score absent from public DTO/DOM</td></tr>
<tr><td>G12</td><td>db+lint</td><td>db-assert/conversation-context.sql</td><td>context_type constrained to 5 values; context_id NOT NULL where required</td></tr>
<tr><td>G13</td><td>lint</td><td>eslint no-lifecycle-string-literals</td><td>lifecycle literals only in contracts/fixtures</td></tr>
<tr><td>G14</td><td>lint+e2e</td><td>eslint require-entitlement-middleware; e2e/tamper-bypass.spec.ts</td><td>every mutation handler calls requireEntitlement; bypass -> 403</td></tr>
<tr><td>G15</td><td>unit</td><td>services/__tests__/audit-on-mutation.test.ts</td><td>each moderation/billing action writes exactly one audit row in-txn</td></tr>
<tr><td>G16</td><td>db+unit</td><td>supabase/tests/lifecycle.test; contracts/__tests__/lifecycle.fuzz.test.ts</td><td>only canonical transitions succeed (Cartesian fuzz)</td></tr>
<tr><td>G17</td><td>unit+e2e</td><td>services/billing/__tests__/webhook-idempotency.test.ts</td><td>replay event 5x -> one entitlement change, one audit row</td></tr>
<tr><td>G18</td><td>unit</td><td>services/notifications/__tests__/governance.test.ts</td><td>preferences/quiet-hours respected; critical always in-app</td></tr>
<tr><td>G19</td><td>rls+e2e</td><td>supabase/tests/demo-isolation.rls.test; e2e/demo.spec.ts</td><td>demo session hits /api/demo/* only; prod tables denied</td></tr>
<tr><td>G20</td><td>lint+runtime</td><td>eslint risky-surface-needs-flag</td><td>risky modules export requireFlag; default off</td></tr>
<tr><td>G21</td><td>db</td><td>db-assert/no-featured-default.sql</td><td>no plan grants featured_employer</td></tr>
<tr><td>G22</td><td>lint+e2e</td><td>eslint verified-host-via-component-only; e2e/badge.spec.ts</td><td>'Verified Host' only via component; subtitle always present</td></tr>
<tr><td>G23</td><td>lint+unit</td><td>contracts/__tests__/addon-pricing.test.ts</td><td>boost.d7===20000; teamSeat.monthly===4900</td></tr>
<tr><td>G24</td><td>unit+db</td><td>services/founding/__tests__/cap-race.test.ts; ci/grep no-seat-decrement</td><td>no seats_taken decrement; cap-race keeps sub active at standard price</td></tr>
<tr><td>G25</td><td>unit+e2e</td><td>services/auth/__tests__/age-gate.test.ts</td><td>DOB required; under-18 -> under_18; no KYC SDK import</td></tr>
<tr><td>G26</td><td>runtime+unit</td><td>services/messaging/__tests__/rate-limit.test.ts</td><td>60/hr, 600/day, 50 threads/day, burst 10/10s -> 429 retry_after</td></tr>
<tr><td>G27</td><td>lint+unit</td><td>eslint moderation-provider-only</td><td>vendor SDK only in providers/; upload sets pending + enqueues check</td></tr>
<tr><td>G28</td><td>db+unit</td><td>contracts/__tests__/retention-coverage.test.ts; sweep.test.ts</td><td>every PII table in retention map; sweep purges per window</td></tr>
<tr><td>G29</td><td>unit+db</td><td>services/billing/__tests__/credit-fifo.test.ts</td><td>oldest unexpired consumed first; expired skipped; 12mo expiry</td></tr>
<tr><td>G30</td><td>lint</td><td>eslint single-icon-system</td><td>only Streamline Freehand registry; no other icon lib / inline svg</td></tr>
</table>

## Notes
- `db:assert` tests are plain SQL run against a throwaway Postgres in CI seeded from the draft schema; they assert structure (columns absent, table-name patterns, constraints), not data.
- `rls:test` uses Supabase's policy test harness with role impersonation (`anon`, `authenticated` w/ seeker vs host-team claims, `demo_viewer`, `service_role`).
- Each ESLint rule listed is a custom rule living in a local `eslint-plugin-explore-earn` package; this plan names them but does not implement them.
