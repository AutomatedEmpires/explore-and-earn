# Explore&Earn Controlled Production-Readiness Pass

**Pass opened:** 2026-07-12

**State-freeze timestamp:** 2026-07-12T14:17:19-07:00

**Scope:** Exact-main Preview, rollback, non-production provider proof, and Production go/no-go.
**Design caveat:** The current UI and design system are not final. This pass avoids visual churn and does not implement the planned discovery-card/navigation overhaul.

No credential values, customer identities, database URLs, cookies, private provider URLs, or webhook signing values are recorded here.

## Executive status

**Final verdict after Phase 2:** **NO-GO for Production users and NO-GO for money.** Phase 2 closed the controlled Preview runtime, one-user dark-auth, remote Mapbox, application-layer Stripe-signature, and Preview rollback-rehearsal gates. Production remains blocked by two-user tenant/role proof, admin/recovery, provider-delivered Stripe webhook and durable money-event idempotency, the Production Doppler contract, mail receipt/reply routing, Supabase hardening, and transfer-grade provider decisions. No Production promotion was performed.

The pass treats these as separate states:

1. provider boundary;
2. environment configuration;
3. exact-main Preview;
4. Production runtime;
5. rollback;
6. user/auth safety;
7. money safety;
8. email safety;
9. telemetry/observability;
10. transfer readiness.

## Pass A — immutable pre-change state freeze

The inventory below was recorded before any code, provider environment, deployment, email, telemetry, or webhook write in this pass.

### GitHub and source

| Item | Frozen state |
|---|---|
| Canonical repository | `AutomatedEmpires/explore-and-earn` |
| Default branch | `main` |
| Exact main commit | `b616b9e10fa434422dd34442f6cb24194cf8d5ec` |
| Commit subject | `fix(ops): scope transactional mail and harden analytics privacy (#243)` |
| Open pull requests | None |
| Canonical local checkout caution | The founder's primary WSL checkout contains extensive uncommitted design/product work on a deleted remote branch. It is preserved and excluded from this pass. |
| Pass work branch | `codex/explore-and-earn-production-readiness`, created from exact `origin/main` in an isolated checkout |

### Vercel deployment and environment state

| Item | Frozen state |
|---|---|
| Canonical project | `explore-and-earn` |
| Current Production | `dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY`, `READY`, exact main `b616b9e…`, rollback candidate |
| Current exact-main Preview | `dpl_8FDMNfHFJojEdbp7kniwELQ2SBju`, `READY` build, exact main `b616b9e…` |
| Preview application state | Homepage completes; `/map` reaches the application error boundary |
| Preview root cause evidence | Vercel runtime trace shows the listing query attempting `127.0.0.1/rest/v1/listings`; `getLiveListingsWithCoords` fails before Mapbox initializes |
| Clerk in Preview | Development keys; browser emits the Clerk development-instance warning |
| Stripe in Preview | Test-mode publishable key and secret plus intended test price variables are present |
| Resend in Preview | Scoped key record plus intended From/Reply-To records are present |
| PostHog in Preview | Venture project key/host records are present; no controlled event yet |
| Sentry in Preview | No dedicated Preview `NEXT_PUBLIC_SENTRY_DSN` record was found in the names-only inventory |
| Mapbox in Preview | Venture-specific public token record is present and targets Development/Preview/Production |
| Protection | Preview is Vercel-authentication protected; authenticated browser access was used without recording bypass material |

### Doppler state

The dedicated project is `explore-and-earn`. Configs are `dev`, `dev_personal`, `stg`, and `prd`; only `dev`, `stg`, and `prd` are application lanes.

| Lane | Relevant names-only state |
|---|---|
| `dev` | Clerk, Cloudinary, Supabase, Stripe test/catalog, Resend, Sentry, PostHog, and Mapbox names are present |
| `stg` | Stripe test/catalog, Resend, PostHog, and Mapbox names are present; Clerk, Supabase, and Sentry names are absent at freeze |
| `prd` | Resend, PostHog, and Mapbox names are present; Clerk, Stripe, Supabase, and Sentry names are absent at freeze |

This means Doppler is not yet an authoritative complete Production contract even though older Vercel Production records exist.

### Supabase state

| Item | Frozen state |
|---|---|
| Project | Dedicated `explore&earn`, ref fingerprint `mamo…hmmr`, `ACTIVE_HEALTHY`, `us-west-2` |
| Public schema | 45 tables; RLS enabled on all 45 |
| Policies | 85 policies across 39 tables |
| Marketplace data | Zero `listings` and zero `host_profiles`; meaningful live marketplace-read proof is unavailable |
| Migration sources | 55 repository SQL files versus 79 remote ledger records |
| Ledger ambiguity | Eight exact duplicate migration names under different versions plus additional overlapping timestamped/reconcile entries; repository 049–057 are represented live under timestamped versions |
| Views | No public views or materialized views |
| Authorization scan | No `user_metadata` authorization use and no `auth.role()` policy use found |
| Storage | Public `community-photos` bucket permits bucket-wide authenticated object listing |
| RLS tests | Repository coverage remains a TODO; no real dark-Clerk JWT ownership proof |

#### Six RLS-enabled tables with no policies

| Table | Classification | Evidence |
|---|---|---|
| `community_view_state` | **Intentional deny-all** | Service-role community state; one live row; anon/authenticated role tests returned zero |
| `email_log` | **Intentional deny-all** | Service-role audit writer; zero rows; anon/authenticated returned zero |
| `events` | **Intentional deny-all** | Server-only/unused current event table; zero rows; anon/authenticated returned zero |
| `media_assets` | **Intentional deny-all** | Internal media registry; zero rows; anon/authenticated returned zero |
| `media_buckets` | **Intentional deny-all** | Internal media registry; zero rows; anon/authenticated returned zero |
| `moderation_actions` | **Intentional deny-all** | Admin service-role audit trail; zero rows; anon/authenticated returned zero |

The six tables are not the immediate `/map` failure. The Preview URL is pointed at localhost, so the request never reaches hosted Supabase.

Additional branch-test candidates—not live changes in this pass—are: revoke client grants on the six internal tables; constrain `community-photos` listing to owner folders; add explicit `WITH CHECK` to three owner-update policies; remove direct authenticated execute from trigger-only `set_host_attestation()`; add multi-identity pgTAP/RLS tests; and review `pg_trgm` placement.

### Clerk state

| Item | Frozen state |
|---|---|
| Organization/plan | AutomatedEmpires / Hobby |
| Application | `explore&earn` |
| Dark Production instance | Separate Production app/instance exists; no users |
| Domain | `exploreandearn.com`: DNS Verified, SSL Issued |
| Account Portal | Default custom-domain sign-in, sign-up, and OAuth-consent paths |
| Connections | Email/password enabled; email verification by code; phone, username, passkeys, MFA, OAuth/social, SSO, and custom connections absent |
| Webhooks/JWT | Zero webhook endpoints and zero JWT templates; Supabase integration toggle is on but claims/template proof is absent |
| Runtime | Exact-main Preview and current Production still use development identity; no dark Production runtime proof |
| Recovery/admin | End-user email recovery behavior and independent admin-recovery runbook are not proven |

### Stripe state

| Item | Frozen state |
|---|---|
| Live account | Dedicated Explore&Earn account `acct_1RMjIWIH4Hw2pSG9`; current connector identity verified without credential display |
| Live catalog | Five active products / ten active prices: Starter, Professional, Enterprise monthly/yearly; Community Announcement; Listing Boost 7/14/28-day |
| Test account | Dedicated `explore&earn_test` account `acct_1TepcWIUt5N2gdTF`; test key mode verified |
| Test catalog | Same five-product/ten-price intent with venture-specific lookup keys |
| Test webhooks | Zero endpoints at freeze |
| Production runtime | Deployed Production credential identity and correct live webhook remain unproven |
| Safety boundary | No live customer, subscription, charge, invoice, PaymentIntent, balance, payout, refund, dispute, tax, or legal state may be mutated in this pass |

### Resend state

| Item | Frozen state |
|---|---|
| Domain | `exploreandearn.com`, verified in `us-east-1`; sending enabled; receiving disabled |
| Tracking | Open and click tracking off |
| Key names | Scoped `explore-and-earn-sending-v3`, broad rollback `explore-and-earn`, and same-team legacy `logloads`; no values inspected |
| Sender | `Explore & Earn <notifications@exploreandearn.com>` in Doppler `dev/stg/prd` and intended Vercel lanes |
| Reply-To | `support@exploreandearn.com` in Doppler `dev/stg/prd` and intended Vercel lanes |
| Delivery | Real internal delivery/reply smoke not yet performed |
| Rollback | Broad key remains; it is not retireable before delivery plus zero-use proof |

### PostHog state

| Item | Frozen state |
|---|---|
| Organization/project | AutomatedEmpires / `exploreandearn`, project ID `291166` |
| Provider history | Project has historical ingestion |
| Environment placement | One E&E project/key/host pair spans Doppler lanes and Vercel targets; environment is not separated into multiple PostHog projects |
| Privacy | Provider settings permit autocapture/replay/console, but exact main consent-gates capture, opts out by default, disables session recording, and disables console capture |
| Controlled event | None sent in this pass at freeze |

### Sentry state

| Item | Frozen state |
|---|---|
| Project | Separate `explore-and-earn` project in the parent Sentry organization |
| Governance | Distinct DSN, scrubbers/IP scrubbing, ownership, and alert rule were established in Pass 4 |
| Environment evidence | Existing development/Production-like environments and unresolved issues are visible; release attribution is not proven here |
| Preview binding | Missing from the Vercel names-only Preview inventory at freeze |
| Controlled event | None sent in this pass at freeze |

### Mapbox state

| Item | Frozen state |
|---|---|
| Token name | `pass5-public-explore-and-earn` |
| Scopes | `styles:read`, `fonts:read` only |
| Origin restrictions | Seven: localhost, `exploreandearn.com`, canonical project aliases, Git-main alias, Pass 4/5 exact Preview aliases |
| Placement | Doppler `dev/stg/prd`; Vercel Development/Preview/Production |
| Previous proof | Exact Preview and localhost allowed; unrelated origin rejected; isolated exact-source Chrome rendered five mapped opportunities |
| Current Preview | Mapbox does not initialize because the upstream Supabase server query fails first |
| Current Production | Unchanged pre-Pass-5 bundle still uses the old shared token |
| Retirement | Old token remains rollback and cannot be retired in this pass |

### Cloudinary state

| Item | Frozen state |
|---|---|
| Account | One shared Free product environment; folder separation is not access control |
| Usage | 1.5/25 credits; 1,009 source resources plus 156 derived; about 1.23 GB storage, 244.7 MB bandwidth, 118 transformations, and 5,566 requests |
| E&E assets | 945 assets under `explore-and-earn/*`; exact main actively consumes Cloudinary delivery URLs |
| Presets | `ee-photos`, `ee-icons`, `ee-illustrations`; signed, overwrite/invalidate enabled, no enforced preset folder/asset-folder, allowed-format, or moderation constraint returned |
| Production effect | Current read-only delivery does not block Production route proof |
| Transfer effect | Shared administration, asset export/URL mapping, and preset constraints block transfer-grade independence |

### Rollback target

The last-good Production target is `dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY` at exact main `b616b9e…`.

Procedural rollback command from the correctly linked project context:

```bash
vercel rollback dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY --scope jackson-coles-projects-dd76106c
```

This command was **not executed** during the state freeze. Live alias reversal would affect Production. The target is `READY` and a provider-recognized rollback candidate; functional rollback proof remains a gate.

Rollback must preserve or restore, as separately versioned controls:

- Vercel deployment alias;
- Doppler lane names and the prior binding set;
- current Clerk development binding;
- existing Stripe endpoint/credential state;
- broad Resend rollback key and sender identity;
- old shared Mapbox token/Production bundle;
- prior PostHog/Sentry environment bindings.

No old credential or token may be revoked before replacement deployment, functional proof, and zero-use observation.

## Execution record

### What changed

The following were real, scoped changes after the state freeze:

1. The canonical hosted Explore&Earn Supabase URL/anon pair was installed in Doppler `stg` and as branch-only Vercel Preview overrides for `codex/exact-main-readiness`.
2. A temporary Git branch pointing to the accepted main commit was created because Vercel will not allow a Preview override on its configured Production branch, `main`. The branch contains no source delta from accepted main.
3. Sentry server/client DSN records and `NEXT_PUBLIC_APP_VERSION=b616b9e…` were installed in Doppler `stg` and the same exact-main Preview branch. No Sentry auth token was copied.
4. PostHog client key/host records were added as non-secret, exact-main Preview-branch overrides after the initial bundle showed no client binding. The client key is public by design; general Production records were not changed.
5. Three exact-source Preview deployments were created/redeployed. No deployment was promoted or aliased to Production.
6. One controlled Resend message was sent; one unpaid/uncompleted Stripe test Checkout Session was created; controlled Sentry/PostHog telemetry tests were run in non-Production contexts.
7. This report and the portfolio Sweepza support-address delta were recorded. No UI redesign or source component rewrite was performed.

No Production Vercel alias, live Stripe object, Clerk user, Supabase row/schema/policy, Cloudinary asset, Mapbox token, provider project, or old credential was deleted, revoked, or promoted.

### Preview error boundary — fixed

**Root cause:** environment mismatch. Exact-main Preview had compiled `NEXT_PUBLIC_SUPABASE_URL` as localhost. `/map` invoked `getLiveListingsWithCoords()`, retried `127.0.0.1/rest/v1/listings` four times, and rethrew before `MapView` could render. Mapbox was never reached.

**Minimum safe fix:** replace only the hosted public URL/anon pair for an exact-main Preview branch. Production, the general Preview records, and the service-role key were not changed. Existing general Preview records remain available as rollback state.

#### Deployment evidence

| Deployment | Source | Purpose | Result |
|---|---|---|---|
| `dpl_8FDMNfHFJojEdbp7kniwELQ2SBju` | accepted main `b616b9e…` | Frozen failing baseline | `READY` build; `/map` error; loopback Supabase trace |
| `dpl_8VKqjDJoQUMMymWoHmKo57mFjDn8` | exact accepted SHA on `codex/exact-main-readiness` | Supabase repair proof | `READY`; `/`, `/seek`, `/map` all HTTP 200; no loopback spans; zero Vercel runtime errors |
| `dpl_H28Y1LigazbacCyuCU98g5BdLzFs` | redeploy of `dpl_8VKq…` | Sentry-bound regression proof | `READY`; `/` and `/map` HTTP 200; hosted reads 200; zero runtime errors |
| `dpl_LW9LvGWrjRT1fzpMQXwGaAxoTm2B` | redeploy of `dpl_H28…` | Final PostHog/Sentry-bound Preview | `READY`; `/` and `/map` HTTP 200; final client bundle/event evidence below |

Vercel retains `gitDirty=1` metadata from the original CLI upload even though the checkout was clean and SHA/ref match accepted main. This is a provider provenance caveat: call the source exact-SHA, not pristine provider metadata.

#### Browser and route proof

| Route | Result | Data/runtime evidence |
|---|---|---|
| `/` | Pass | Full homepage, no boundary; three hosted E&E Supabase reads returned 200 |
| `/seek` | Pass | “Seek opportunities” and honest empty state; hosted listings read returned 200 |
| `/map` | Pass for route health | Honest “No mapped opportunities”; hosted listings read returned 200; no “Map unavailable” or error boundary |

No `localhost`/`127.0.0.1` outbound spans appeared after the fix. Direct route rendering showed no fatal console or server crash. Automatic Next link prefetches to Clerk-protected routes still produce client `Failed to fetch RSC payload` messages, and Preview displays the Clerk development-key warning. These are auth-lane defects, not a recurrence of the Supabase failure.

The hosted database contains zero coordinate-bearing live listings. Exact main intentionally returns before constructing Mapbox when the result is empty. Therefore remote Mapbox canvas/token attribution remains blocked even though `/map` route health passes. Production data was not seeded for a visual proof, and the component was not changed solely to manufacture one.

### Rollback proof

The rollback artifact remains `dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY`, `READY`, at accepted main. Vercel accepts it as a rollback candidate. The exact command is:

```bash
vercel rollback dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY --scope jackson-coles-projects-dd76106c
```

The command was not executed because it would move live aliases. Safe Preview deploy/redeploy mechanics were exercised with the same accepted source, but full functional rollback is **blocked**: the Production alias, Production Doppler contract, dark Clerk binding, Stripe webhook, and Production token bundle have not been changed or jointly rehearsed.

Rollback requirements by provider:

| Control | Rollback state |
|---|---|
| Vercel | Re-alias the last-good deployment; command above |
| Doppler | Restore the prior lane snapshot/secret versions; do not delete current records |
| Clerk | Retain the current development binding until dark Production login/JWT/webhook proof passes |
| Stripe | Keep the current live credential/endpoint state; never remove an endpoint before replacement proof and approval |
| Resend | Retain the broad rollback key and verified sender until scoped-key zero-use proof |
| Mapbox | Retain the shared token and old Production bundle until replacement-token zero-use observation |
| PostHog/Sentry | Restore the prior Vercel env binding set and redeploy; no project deletion |

### Clerk dark Preview readiness

The separate dark Production Clerk boundary is real—verified custom domain/TLS, zero users—but it was **not activated** in Preview. Its present settings cannot support a safe cutover:

- zero webhook endpoints and zero JWT templates;
- the application calls `getToken({ template: "supabase" })`, so authenticated Supabase reads cannot work without that template and verified claims;
- `user.created` requires a signed Svix endpoint and writes `users_profile_shadow` plus `seeker_profiles` with a service-role client;
- seeker/host behavior is profile-based; admin access is a single configured Clerk user ID, not a tested claim-based role;
- allowed Preview origins/redirects, sign-up, sign-in, logout, recovery, and admin recovery were not end-to-end tested;
- current exact-main Preview still uses Clerk development keys and emits protected-route prefetch errors.

Installing dark Production keys without a signed webhook, Supabase JWT template, test identities, and rollback user would create a misleading partial activation. This gate is **fail/blocked by production risk** and needs a founder-attended Clerk configuration session.

### Stripe test-mode proof

The dedicated test credential was hard-gated to test mode before any API call and resolved to `acct_1TepcWIUt5N2gdTF` (`explore&earn_test`, US/USD).

- Five active products and ten active prices matched the canonical E&E catalog.
- Before the proof: zero customers, PaymentIntents, charges, subscriptions, invoices, Checkout Sessions, or webhook endpoints.
- Exactly one test Checkout Session was created for the seven-day listing boost. It remained `open`, `unpaid`, and `livemode=false`; it was not opened or completed.
- After the proof: exactly one Checkout Session and still zero customers, PaymentIntents, charges, subscriptions, or invoices.
- Live mode was never accessed.

Exact-main code disables Checkout unless both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` exist. No `STRIPE_WEBHOOK_SECRET` exists in Doppler `dev`, `stg`, or `prd`, and the test account has zero endpoints. Therefore app Checkout and signed webhook receipt/idempotency remain **blocked**. The next money gate is a public-safe test Preview endpoint, installed test signing secret, controlled test event/Checkout, database receipt/idempotency proof, then a separate written live migration plan and founder approval.

### Resend delivery/reply smoke

One non-sensitive internal smoke was sent using:

- From: `Explore & Earn <notifications@exploreandearn.com>`;
- Reply-To: `support@exploreandearn.com`;
- recipient: the existing internal E&E support mailbox;
- subject clearly labeled controlled production-readiness smoke;
- no customer data or secrets.

Resend accepted provider message `1ce90398-e704-40ca-8144-6d38d4b5f808` and confirmed the intended headers/content. Provider state remained `sent`, not `delivered`, at the verification window. Send path and identity pass; inbox receipt, reply behavior, bounce/suppression outcome, and scoped-key zero-use remain **pending/blocked**. The broad rollback key remains and is not retireable. Sweepza was not touched.

### Sentry controlled event and Preview binding

The canonical E&E DSN was validated against the dedicated `explore-and-earn` Sentry project before installation. Branch-only Preview records now cover server DSN, client DSN, and accepted release SHA. The Sentry auth token was not copied, so build output correctly warns that release creation and source-map upload are absent.

A safe-test submission bug caused two otherwise identical controlled events rather than one. Both are non-sensitive, in the E&E project, attributed to environment `preview` and release `b616b9e…`. Verification found no user ID, email, username, IP address, request URL, request headers, or request body. Sentry added coarse geo enrichment at ingest; no customer identity was supplied. The duplicate was not deleted because this pass avoids destructive provider cleanup.

On the final Sentry-bound Preview regression, normal request instrumentation also emitted successful Sentry envelopes. Runtime project binding therefore passes; source maps/release creation and long-window alert delivery remain follow-up items.

### PostHog controlled event and privacy posture

The dedicated E&E project is `exploreandearn`, ID `291166`. Exact-main source:

- opts capture out by default;
- requires explicit cookie-banner acceptance;
- disables session recording;
- disables console capture.

Provider project flags still permit autocapture, replay, and console capture, and IP anonymization is off. Application settings currently constrain the browser behavior, but provider-level posture is broader than intended and must be reviewed before Production.

Exactly one direct safe-test event, `production_readiness_smoke`, was accepted with HTTP 200 and independently returned by HogQL from project `291166`. It carried only a synthetic distinct ID, `environment=preview`, accepted-main fingerprint, `source=codex-controlled-smoke`, and `$process_person_profile=false`; no person profile, PII, or secret was sent.

The initial repaired Preview bundle contained no PostHog client key even though general Vercel records existed. Canonical Doppler `dev/stg` client values were verified equal and installed as branch-only, build-readable Preview overrides; Production was not changed. The final branch-bound deployment scanned all 19 client scripts and found the expected PostHog client plus exactly one project-key fingerprint without exposing its value. `/` and `/map` remained HTTP 200.

In real Chrome on the unique Preview origin, analytics consent was accepted through the UI. Exactly one `production_readiness_runtime_smoke` originated from that page with the compiled key; provider ingest returned HTTP 200 and HogQL independently found exactly one matching row in project `291166` with `environment=preview`, the deployment/accepted-main fingerprints, and `$process_person_profile=false`. No PII or person profile was created. The consented test tab was closed. Runtime binding therefore passes.

### Supabase / RLS / migration ledger

- The repaired Preview performs hosted public reads successfully; all tested listing/campaign requests returned 200.
- All 45 public tables have RLS enabled; 85 policies cover 39 tables.
- The six no-policy tables are intentional service-role-only deny-all resources. Simulated `anon` and `authenticated` reads returned zero rows.
- The project has zero listings and zero host profiles, so substantive marketplace and two-tenant behavior are not proven.
- The migration lineage remains ambiguous: 55 repository files versus 79 live records, including exact duplicate names and semantic/reconcile overlap. Do not replay, push, or repair blindly.
- `community-photos` permits authenticated bucket-wide object listing.
- Six internal tables retain broad direct grants even though RLS denies rows; three update policies lack explicit ownership `WITH CHECK`; a trigger-only function retains unnecessary authenticated execute; automated Clerk-JWT RLS tests are absent; `pg_trgm` remains in `public`.

No Supabase data, schema, policy, grant, function, storage object, or ledger record was changed. Safe next work is a disposable branch/database: canonical schema/ledger diff, pgTAP two-user Clerk JWT tests, internal-grant revocation, owner-folder Storage policy, explicit update checks, trigger grant cleanup, and non-sensitive Preview fixtures.

### Mapbox Production rollout readiness

The venture token `pass5-public-explore-and-earn` remains in Doppler and Vercel with only `styles:read`/`fonts:read` and the expected seven origin restrictions. Prior isolated exact-source proof established allowed Preview/localhost and rejected an unrelated origin. Current Production still bundles the old shared token.

The repaired remote Preview cannot exercise the replacement token because zero mapped rows trigger the intentional empty-state return before Mapbox construction. This is **blocked**, not a token failure. Do not retire the old token until a branch with an isolated coordinate fixture or an approved empty-base-map code path renders remotely, Production deploys the replacement, telemetry/logs show no use of the old token for an observation window, and rollback is rehearsed.

### Cloudinary boundary review

Exact main actively consumes 945 E&E assets under the shared product environment. Read-only delivery is healthy and does not block current Production route operation. Transfer readiness remains blocked by shared administration and export/URL mapping, plus signed presets that allow overwrite/invalidate and lack enforced E&E folder, allowed-format, or moderation constraints. No media, preset, URL, or account was changed.

### Portfolio founder note

`support@sweepza.com` is now founder-owned and additional aliases are available. Sweepza email activation is deferred to a Sweepza-specific pass. Ownership is recorded as a future prerequisite, not as delivery remediation; no Sweepza provider or runtime setting changed.

## Production gate matrix

| Gate | Final status | Evidence / blocker |
|---|---|---|
| Exact-main Preview route health | **PASS** | `/`, `/seek`, `/map` render; hosted reads 200; no loopback; zero fatal server errors |
| Rollback proof | **BLOCKED** | Target and command proven; live alias/config rollback not functionally rehearsed |
| Production env contract from Doppler | **FAIL** | `prd` still lacks Clerk, Stripe, Supabase, and Sentry contract names |
| Supabase read/RLS sanity | **BLOCKED / FAIL** | Public read passes; ledger, Storage enumeration, grants, tenant JWT, and regression tests remain unsafe |
| Clerk dark Preview proof | **FAIL** | No dark runtime keys/JWT/webhook/users/recovery/role test; current Preview uses development keys |
| Stripe test-mode proof | **PASS WITH BLOCKER** | Account/catalog/provider Checkout pass; app Checkout and signed webhook fail |
| Resend delivery/reply smoke | **BLOCKED** | Provider accepted correct identities; delivered/received/replied not proven |
| Sentry runtime event | **PASS WITH FOLLOW-UP** | Preview binding and environment/release event proof pass; source-map/release upload absent |
| PostHog controlled event | **PASS** | Provider safe-test and one consented real-Preview runtime event landed in project `291166` with `environment=preview` and no person profile |
| Mapbox replacement Preview proof | **BLOCKED** | Route healthy, but zero mapped data prevents canvas/token exercise |
| Cloudinary Production risk | **PASS WITH TRANSFER EXCEPTION** | Existing delivery safe; transfer-grade separation blocked |
| Support channel | **PASS / REPLY UNPROVEN** | E&E support address configured; reply smoke pending |
| Privacy posture | **PASS WITH CAVEATS** | PostHog opt-in/no replay/no console in code; provider flags and Sentry geo enrichment need review |
| Admin/recovery path | **FAIL** | Admin depends on a single configured Clerk ID; dark recovery not proven |

## Production go/no-go

**Do not promote Explore&Earn to Production users. Do not enable real money.** The public exact-main Preview is materially healthier, but the failed/blocked gates above are user- and money-safety boundaries, not documentation debt.

No credential or token can be retired yet. In particular: retain the old shared Mapbox token, broad Resend rollback key, current Clerk development binding, current Stripe endpoint/credential state, and last-good Vercel deployment.

## Recommended next pass

1. Founder-attended Clerk dark-lane session: allowed origins/redirects, Supabase JWT template/claims, signed webhook, two synthetic users, seeker/host/admin/recovery proof, and rollback user.
2. Disposable Supabase branch/database: reconcile ledger without rewriting live history; add fixtures and two-user pgTAP/RLS/Storage tests; harden grants/policies.
3. Stripe test endpoint pass on a public-safe Preview: install test signing secret, deliver and verify a signed event, run app Checkout, prove idempotency, and confirm zero live objects.
4. Complete Resend inbox/reply/suppression observation and prove scoped-key use before any rollback-key retirement.
5. Render Mapbox remotely with isolated non-sensitive coordinate fixtures or an approved minimal empty-base-map behavior, then observe replacement-token use before Production rollout.
6. Rehearse a full Preview rollback bundle—deployment plus Doppler/Clerk/Stripe/Resend/Mapbox/PostHog/Sentry—before any live alias movement.
7. Keep the planned E&E design-system overhaul separate; do not lock current UI primitives during infrastructure remediation.

## Final conclusions

1. **What is now proven:** the exact accepted source can render public E&E routes in Preview against hosted Supabase; the loopback defect is fixed; Stripe test identity/catalog/unpaid Checkout, Resend send identity, Sentry ingestion, consented PostHog Preview ingestion, dedicated provider boundaries, RLS enablement/deny-all intent, and Cloudinary read delivery are evidenced.
2. **What remains unsafe:** dark auth, real tenant ownership, signed Stripe webhooks/app Checkout, Production Doppler contract, functional rollback, Supabase ledger/Storage/RLS regression posture, Resend receipt/reply, remote Mapbox replacement use, and transfer-grade Cloudinary.
3. **What I recommend doing next:** run the founder-attended Clerk + isolated Supabase fixture/RLS pass, then Stripe signed-webhook/app Checkout and full rollback rehearsal.
4. **Whether Explore&Earn is ready for Production users:** **No.**
5. **Whether Explore&Earn is ready for money:** **No.**
6. **Whether any credential/token can be retired yet:** **No.**

## Phase 2 — NO-GO blocker closure

**Phase opened:** 2026-07-12

**Scope:** Dark Preview auth, Stripe test webhooks, Production environment contract, non-destructive data isolation, Preview rollback rehearsal, remote Mapbox fixture proof, and internal email delivery/reply evidence. No Production launch or credential retirement is authorized.

### Phase 2 pre-change freeze

This snapshot was taken before Phase 2 provider or repository changes.

| Surface | Frozen state |
|---|---|
| PR | Draft PR `#244`, head `04c67fd7b383d7e0e0023a178a604f5f6cbb3adc`, mergeable, all recorded checks green |
| PR scope | One documentation-only commit adding this report |
| PR Preview | `dpl_2Wo7p4tcWSEXWJPe35zsKvSitpa6`, `READY`; build status only, no runtime proof |
| Proven exact-main Preview | `dpl_LW9LvGWrjRT1fzpMQXwGaAxoTm2B`, `READY`, accepted main `b616b9e…` |
| Current Production | `dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY`, `READY`, accepted main `b616b9e…`; last-good rollback target |
| Prior Production fallback | `dpl_6m17ghudS8NvDTCPX7PVp7CadJdv`, `READY`, source `98dd3591…` |
| PR branch environment | No branch-specific Vercel overrides at freeze |
| Critical regression risk | General Preview Supabase records are the previously diagnosed localhost lane; the PR Preview is not assumed healthy merely because it built |
| Doppler `dev` | Clerk, hosted Supabase, Stripe test/catalog, Resend, Sentry, PostHog, Mapbox, and Cloudinary names present |
| Doppler `stg` | Hosted Supabase public pair, Stripe test/catalog, Resend, Sentry runtime pair, PostHog, and Mapbox names present; Clerk/webhook/service-role names absent |
| Doppler `prd` | Resend, PostHog, and Mapbox names only; Clerk, Supabase, Stripe, Sentry, app URL, cron, and admin contract absent |
| Webhook secrets | No `STRIPE_WEBHOOK_SECRET` or `CLERK_WEBHOOK_SECRET` in Vercel at freeze |

The isolated Windows checkout on `codex/explore-and-earn-production-readiness` is the only Phase 2 write location. The founder's dirty WSL design checkout remains untouched.

### Phase 2 execution record

Phase 2 safely corrected the repository's Clerk/Supabase architecture, added dark-Preview-only environment bindings, established the hosted Supabase trust boundary, and completed the local validation and read-only Supabase audit. It did not launch Production, enable money, create any external/customer identity, alter database data/schema/policies, or retire any credential. One internal synthetic Clerk identity was created solely for the controlled auth proof described below.

All earlier provider/state tables in this document are historical Pass 1 evidence unless Phase 2 explicitly repeats or supersedes them. In particular, the current dark Clerk user count is one internal synthetic identity, and the current Resend message state is `delivery_delayed`.

#### Change from Pass 1

| Gate | Pass 1 | Phase 2 change |
|---|---|---|
| Clerk/Supabase contract | Development binding; named-template assumption; no dark runtime | Native session-token source contract and additive issuer/JWKS trust installed; protected owned Preview origin proves one-user dark auth |
| Stripe webhook | Test Checkout/account/catalog only | Remote application signature/replay/rejection behavior proven with controlled synthetic signing; provider delivery and handled-event ledger remain open |
| Mapbox | Hosted route could not construct a map because no mapped rows existed | Preview-only fixture seam renders canvas, five markers, and attribution with origin restriction proof |
| Rollback | Deployment target/command documented, no functional rehearsal | Protected temporary alias rehearsed candidate → last-good Preview → candidate and was removed |
| Supabase | RLS inventory known; no Clerk-token tenant proof | Read-only audit deepened and native auth trust added; live fixtures remain prohibited, so two-user tenant/storage proof is still blocked |
| Resend/support | Provider accepted send; delivery/reply pending | Provider now reports `delivery_delayed`; DNS proves the domain exists but has no receiving MX/mailbox route |
| Production | Hard NO-GO | Production deployment, aliases, environment bundle, money state, and credentials remain unchanged and NO-GO |

#### Clerk/Supabase architecture correction

The earlier Pass 1 statement that Explore&Earn requires a named Clerk `supabase` JWT template is **superseded by this Phase 2 evidence**. Clerk's current native Supabase integration uses the Clerk issuer/JWKS as a Supabase third-party authentication provider and ordinary `getToken()` calls. A named template is not part of the accepted target architecture.

The controlled source change:

- replaced all 99 `getToken({ template: "supabase" })` call sites with `getToken()` across 72 files;
- tightened the two optional-token wrapper types to their actual zero-argument contract;
- removed stale comments that described the deprecated template dependency;
- added `tools/scripts/check-preview-readiness.mjs`, which rejects any reintroduction of the named template and unsafe Preview-fixture activation;
- added the guard to the repository's normal `guardrails` chain.

The dedicated Supabase project now has one additive third-party auth integration for the verified Clerk Production issuer and JWKS on `clerk.exploreandearn.com`. The Supabase Management API returned HTTP 201; the post-write inventory returned provider count `1`, type `custom`, with the expected issuer/JWKS host. The `custom` label reflects the Supabase API object type, not a hand-rolled token format. No Supabase Auth provider was disabled and no database object or row changed.

This establishes cryptographic trust and Phase 2 also proved the dark instance can run without touching the current Production deployment. The first Vercel candidate exposed a malformed publishable-key copy: the Clerk dashboard's visually truncated field had been transferred instead of the full quick-copy value. Edge middleware correctly failed closed with `Publishable key not valid.` The full pair was re-read from Clerk's environment-pair control without displaying it, both exact-branch records were replaced, key material was cleared from memory, and the corrected candidate passed.

Clerk rejected the `vercel.app` browser origin even with the correct pair. The owned, isolated `phase2-readiness.exploreandearn.com` origin was therefore created as a new GoDaddy A record, attached only to the corrected Preview deployment, issued a Vercel certificate, and verified as Vercel-authentication protected. No existing DNS record or Production domain moved. On that origin:

- the dark sign-in and sign-up components rendered with no Clerk origin error;
- one internal synthetic user was created and the verification message reached the founder-controlled Gmail inbox;
- `/profile` loaded as a protected signed-in route;
- sign-out redirected the same protected route to `/sign-in`;
- password login returned to `/profile`;
- the custom Clerk account portal loaded and exposed account/logout controls.

This is a **partial dark-auth pass**, not complete authorization proof. It proves a Clerk session can protect an application route, but it does not prove the JWT/session claims expected by Supabase or any seeker/host/admin role claim. Only one identity exists, no host/seeker cross-tenant fixture exists, the application exposes no password-recovery entrypoint, social/OAuth/MFA/SSO are not configured, `ADMIN_CLERK_USER_ID` remains unset, and no Clerk webhook/signing secret is installed. The rollback boundary remains Preview-only: the owned evidence alias can return to the exact-main Preview without moving Production, while any future Production auth migration must retain the prior Clerk binding and a recoverable founder identity until full session/RLS/webhook proof passes. A non-fatal Cloudflare Turnstile `600010` warning appeared during the automated profile run and must be rechecked in a founder-operated browser before launch.

#### Exact-branch Preview environment bundle

The exact PR branch `codex/explore-and-earn-production-readiness` now has Preview-only overrides for:

- the dark Clerk publishable/secret pair and sign-in/sign-up routes;
- `PREVIEW_MAP_FIXTURES=1`;
- the validated hosted Supabase public pair for project fingerprint `mamo…hmmr`;
- the dedicated Sentry server/client pair;
- the E&E PostHog client pair;
- application URL/version metadata;
- controlled Stripe test signing material.

The Stripe signing value was locally generated and installed in Doppler `stg` plus the exact Preview branch. It is not a Stripe-provider endpoint secret. It was used only for the controlled remote signature test described below. Production target changes were explicitly false. No service-role key was copied into this bundle.

The fixture gate is constrained in source to `NODE_ENV=production`, `VERCEL_ENV=preview`, and `PREVIEW_MAP_FIXTURES=1`, and it is consumed only by the `/map` discovery-coordinate path. It cannot be activated by the Production environment. General Preview and Production records were not replaced.

#### Local source validation

Validation ran from the isolated Windows checkout at commit `a6f438c143037680d2518d48fdb90817c19269b9`:

| Check | Result |
|---|---|
| Frozen install | **PASS** with pnpm `10.12.4`; host Node `24.18` emitted the expected warning against repository pin `24.16.0` |
| Phase 2/static guardrails | **PASS** |
| TypeScript typecheck | **PASS** |
| ESLint | **PASS** after removal of one unused import introduced by the mechanical auth edit |
| Unit tests | **PASS** — 161 passed, 2 skipped (`mailer` 11, `stripe-seed` 4, `db` 146) |
| Production build | **PASS** — 4 tasks; 30 static pages |
| `git diff --check` | **PASS**; CRLF conversion warnings only |

The source commit was pushed to draft PR `#244` at head `a6f438c…`; the PR remained open, draft, and mergeable when the runtime evidence was collected. The final documentation-only commit records that evidence and does not change the application source exercised by the candidate deployment. Final PR state/checks are reported in the handoff because those external statuses can change after this report is committed.

#### Supabase read-only audit and remaining tenant gate

The Phase 2 read-only audit reconfirmed the dedicated project is `ACTIVE_HEALTHY`, all 45 public tables have RLS enabled, and 85 policies cover 39 tables. The six no-policy tables remain intentional deny-all resources. It also reconfirmed:

- 55 repository migration files versus 79 remote ledger records, including eight duplicate migration names; do not push, replay, or repair the live ledger blindly;
- broad `anon`/`authenticated` grants remain wider than the policy boundary;
- `community-photos` still permits bucket-wide authenticated object listing;
- three owner-update policies lack an explicit ownership `WITH CHECK`;
- the trigger-only `set_host_attestation()` function retains unnecessary direct authenticated execute;
- the admin client lacks a build-time `server-only` boundary, and dev-bench service-token handling needs the same hardening;
- the existing RLS isolation test mints a legacy symmetric token and does not prove Clerk third-party-auth behavior.

The live project still contains zero hosts, seekers, listings, or Storage objects. That makes a meaningful two-identity ownership/visibility/Storage test impossible without introducing fixtures into the live project. Phase 2 did not do that. The safe next proof belongs on a disposable Supabase branch/database or an explicitly approved isolated fixture lane.

#### Stripe test webhook status

The corrected Preview candidate received a synthetic `livemode=false` event over its public webhook route using the controlled, non-provider signing value installed for this exercise. The first valid request returned HTTP 200 with the expected ignored-event action. Replaying the same signed event returned the same HTTP 200/action, and an invalid signature returned HTTP 400. The ignored event has no database mutation path, no Stripe object was created, and provider transport was not exercised.

This is a **PASS for the application's remote signature-verification and stable ignored-event behavior**, but only a **partial Stripe gate**. The locally generated signing value is not an endpoint secret issued by Stripe, the test did not prove Stripe-to-Preview delivery, and the application has no general event-ID ledger proving durable idempotency for handled money events. No live Stripe mode was accessed and no customer, charge, subscription, invoice, PaymentIntent, payout, refund, dispute, tax object, endpoint, or live webhook was changed. Money remains NO-GO.

#### Resend delivery/reply blocker

The controlled internal message preserved the intended From and Reply-To identities, but the latest provider state is `delivery_delayed`. Independent DNS verification found no root-domain MX record for `exploreandearn.com`, so `support@exploreandearn.com` is not presently a proven receivable/reply-capable mailbox. Inbox receipt, reply behavior, bounce outcome, and suppression state therefore remain unproven. No second message was sent because repeated delivery attempts cannot remediate absent mail routing.

This is not a missing-domain blocker: the sending domain exists and is verified. It is a founder decision about the receiving-mail provider/MX route and mailbox ownership. The broad rollback key remains in place and cannot be retired.

#### Sentry, PostHog, privacy, Cloudinary, and admin state

- **Sentry:** the dedicated client/server bindings are present on the exact Preview branch. Prior Preview ingestion evidence remains valid, but no Phase 2-candidate-tagged event was emitted. Source-map/release upload remains absent because no Sentry auth token was copied.
- **PostHog:** the dedicated key/host pair is present on the exact Preview branch. Exact-main still defaults capture off, requires consent, disables session recording, disables console capture, and suppresses person-profile creation in the controlled event path. Provider flags remain broader than the source posture and require review before launch.
- **Cloudinary:** no Phase 2 mutation occurred. Current E&E delivery remains operational, while shared Free-plan administration, export/URL mapping, and weak preset constraints remain a transfer-grade blocker. Media migration or deletion was not attempted.
- **Admin/recovery:** the code's admin model depends on a single configured Clerk user ID rather than a tested role/claim boundary. Phase 2 deliberately left that variable unset, so admin remains locked; no independent founder/admin recovery identity or end-to-end recovery proof exists.

#### Candidate runtime, Mapbox, and rollback evidence

The first post-change candidate, `dpl_35dhnY3uwbESyNKV3wYaTgi91bu9`, reached `READY` but failed every middleware route because the copied Clerk publishable key was malformed. It is retained only as diagnostic evidence and was not promoted. After replacing the exact-branch Clerk pair from Clerk's complete environment-pair control, candidate `dpl_AmWDHqD1oqEFN7nFMZsXPmyGDaFJ` reached `READY`. Authenticated Vercel requests returned HTTP 200 for `/api/health`, `/`, `/seek`, and `/map`; the later 30-minute log check found zero HTTP 500s.

The existing allowed non-production alias `explore-and-earn-git-cod-d0bc70-jackson-coles-projects-dd76106c.vercel.app` was pointed to the corrected candidate. Real Chrome rendered one Mapbox canvas, five fixture markers, one attribution control, and no `Map unavailable` fallback. A final clean-console check on the owned protected origin reproduced the same canvas/marker/attribution counts with zero browser warnings or errors; later server-log inspection found zero route 500s. The browser-used public token matched the venture-specific E&E Doppler staging token without printing either value, proving the old/shared token is not needed by this Preview build. Origin probes against the venture token returned HTTP 200 for the allowed Preview alias and localhost, and HTTP 403 for an unrelated origin. Read-only token metadata confirmed only `styles:read` and `fonts:read`. No Mapbox token/restriction was changed, and the old/shared token remains in rollback state because a Production observation/zero-use window has not occurred.

A temporary Preview-only rollback alias was rehearsed from the corrected candidate to exact-main last-good Preview `dpl_LW9LvGWrjRT1fzpMQXwGaAxoTm2B` and back to the candidate. At each stage the alias resolved to the expected immutable deployment, Vercel protection remained enforced for unauthenticated requests, and authenticated `/api/health` returned HTTP 200. The temporary alias was then removed and returned HTTP 404. This is a **PASS for Preview deployment/alias rollback mechanics**; it is not a Production bundle rollback rehearsal.

The rehearsal moves only the alias between immutable builds. It does not rewrite Doppler or branch environment records, rotate credentials, remove webhook endpoints, or change provider projects. Success is detected by the alias resolving to the intended immutable deployment, protected unauthenticated behavior, authenticated health HTTP 200, and no route-level 500s. If auth, payment, email, or map changes are later promoted, rollback must remain replacement-first: retain the last-good deployment and prior Clerk binding, Stripe endpoint/credentials, Resend key/identity, Mapbox token/origins, and matching environment bundle until the replacement is deployed, provider-tested, observed, and independently reversible.

No Production alias or environment record was moved. Current Production remains `dpl_5HCPaCNCQuyip2iZTHpoMvSxjQFY`, and the prior Production fallback remains unchanged.

### Phase 2 final gate table

| Gate | Status | Evidence | Remaining blocker | Safe next action |
|---|---|---|---|---|
| Exact-main Preview health | **PASS — completed** | Exact-main `dpl_LW9…` and corrected Phase 2 `dpl_AmW…` are `READY`; corrected candidate returns 200 for health, home, seek, and map with no later 500s | Documentation commit is not the application artifact tested at `a6f438c…` | Keep immutable candidate and exact-main IDs in rollback inventory; retest only if application source/env changes |
| Dark Clerk proof | **PARTIAL — safely fixed now** | Protected owned Preview origin proves sign-up email verification, password login, protected profile, logout, and account portal; Supabase issuer/JWKS trust is installed | No two-user tenant/RLS proof, role claims, webhook/signature, recovery UI, social/OAuth/MFA/SSO, or recoverable Production admin | Create a disposable two-tenant fixture lane, configure signed Clerk webhook, and founder-test recovery/Turnstile before Production binding |
| Signed Stripe webhook proof | **PARTIAL — safely fixed now** | Synthetic `livemode=false` valid and replay requests return 200; invalid signature returns 400; ignored action has no DB mutation | Signing value is not Stripe-issued; no provider transport, handled-event ledger/idempotency, or approved live plan | Create a Stripe test endpoint for an approved isolated Preview, prove provider delivery and durable handled-event replay, then draft the live migration plan for founder review |
| Production Doppler contract | **FAIL — blocked by production risk** | `ENV_CONTRACT.md` inventories provider source, consumer, dev/stg/prd presence, placement, and approval gates | `prd` lacks Clerk, Supabase, Stripe, Sentry, app/admin, cron, and support-receipt completeness | Fill only provider-verified replacement values under a founder-attended Production migration plan; do not infer/copy unknowns |
| Supabase ledger/storage/tenant testing | **PARTIAL — completed audit; blocked by production risk** | Project healthy; 45/45 public tables use RLS; 85 policies on 39 tables; six no-policy tables remain deny-all; no live mutation | Migration ledger divergence, broad grants, Storage listing exposure, update/check gaps, and no real two-Clerk-token isolation proof | Use a disposable branch/database for canonical diff, pgTAP two-user JWT tests, least-privilege grants, and owner-folder Storage policy |
| Functional rollback rehearsal | **PASS for Preview — completed** | Temporary protected alias moved candidate → `dpl_LW9…` → candidate; identity/protection/health passed at each step; alias removed and returned 404 | Full Production deployment-plus-provider/env bundle rollback is not rehearsed | Preserve both immutable deployments and every prior provider binding; rehearse a complete non-Production bundle before any live alias movement |
| Remote Mapbox fixture proof | **PASS — completed** | Owned protected Preview shows one canvas, five markers, attribution, no unavailable fallback, and zero browser warnings/errors; browser token matches the venture Doppler token; allowed origins 200, unrelated origin 403 | Production replacement-token use and zero-use observation for old/shared token are absent | Deploy only after promotion approval, observe token telemetry/logs, then separately approve retirement after rollback window |
| Resend delivery/reply | **FAIL — requires founder decision** | Sender and Reply-To headers are correct; provider state is `delivery_delayed`; no root MX exists | No receiving mailbox/MX, inbox receipt, reply, bounce, or suppression proof | Founder selects mailbox/provider and authorizes MX; then send one internal test and verify receipt/reply/provider outcome |
| Sentry | **PARTIAL — safely fixed now** | Dedicated client/server pair is bound to exact branch; earlier Preview ingestion remains proven | No Phase 2-candidate ingestion attribution or source-map/release upload | Emit one non-sensitive tagged Preview event after approved auth/data test; issue scoped build token only if source maps are required |
| PostHog | **PARTIAL — safely fixed now** | Dedicated pair is bound; earlier consented Preview ingestion passed; source defaults capture off and disables replay/console/person profiles | Provider flags remain broader than source posture; no Phase 2-candidate attribution | Reconcile provider privacy flags, repeat one consented non-sensitive event, and retain default-off posture |
| Cloudinary risk | **FAIL — blocked by payment/plan and requires founder decision** | Delivery remains operational; no media/provider mutation occurred | Shared Free administration, transfer/export/URL mapping, and preset restrictions are not transfer-grade | Founder chooses paid isolated environment vs accepted shared-risk plan; inventory/migrate only under an approved reversible media plan |
| Support channel | **FAIL — requires founder decision** | Sending domain exists and is verified; `support@exploreandearn.com` has no proven receiving route | Mailbox owner/provider, MX, monitoring, and recovery ownership are undefined | Provision the founder-owned support mailbox, publish MX, document owner/recovery, and prove an internal reply loop |
| Privacy posture | **PARTIAL — blocked by production risk** | Analytics source is consented/default-off; no customer data was used; no Cloudinary/Supabase content was changed | Storage bucket listing, provider analytics flags, retention/access policy, and community-photo privacy decision remain | Founder decides photo visibility; test owner-folder policy and document analytics retention/access before users |
| Admin/recovery | **FAIL — requires founder decision** | Admin variable is unset and admin remains locked; code model is a single Clerk user ID | No recoverable founder/admin identity, role/claim boundary, backup admin, or end-to-end recovery proof | Founder designates recoverable Production admin(s); implement claim-based least privilege and test recovery/lockout in Preview |

### Phase 2 final go/no-go

The remote evidence markers are closed. The remaining NO-GO decisions are substantive provider, tenancy, recovery, mail, and Production-contract gates; documentation alone cannot close them.

| Decision | Verdict | Reason |
|---|---|---|
| Production users | **NO-GO** | One-user dark auth passes, but two-user tenant/RLS/role proof, Clerk webhook, admin/recovery, support-mail receipt/reply, and Production configuration are not green |
| Real money | **NO-GO** | Application signature rejection/replay stability passes, but Stripe-provider delivery, handled-event durable idempotency, live catalog/migration approval, and Production configuration are absent |
| Production promotion | **NO-GO** | Candidate runtime, remote Mapbox, and Preview alias rollback pass; the Production env contract, full auth/tenant/recovery gate, mail route, and Production bundle rollback remain incomplete |
| Credential/token retirement | **NO-GO** | No Production observation/zero-use window exists; retain the current Clerk/Stripe fallback state, broad Resend key, old/shared Mapbox token, and immutable Vercel rollback deployments |

Founder decisions still required:

1. select and fund a disposable Supabase branch/database for two-user Clerk JWT, tenant, RLS, Storage, and handled-event ledger testing;
2. designate a recoverable Production admin model and backup/recovery owner;
3. select the `support@exploreandearn.com` receiving-mail provider/owner and authorize MX publication;
4. decide whether community photos are owner-only, tenant-visible, or deliberately public;
5. review and approve a Stripe live-account/catalog/webhook migration plan after it is drafted; no approved live plan exists and no live endpoint, customer, subscription, or charge work may precede approval;
6. choose a paid isolated Cloudinary environment or explicitly accept/document the shared Free-plan transfer risk.

No Production launch, live-money migration, customer communication, database mutation, provider deletion, credential revocation, or media migration was performed in Phase 2.
