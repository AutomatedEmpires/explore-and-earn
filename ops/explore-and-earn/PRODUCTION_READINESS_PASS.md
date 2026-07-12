# Explore&Earn Controlled Production-Readiness Pass

**Pass opened:** 2026-07-12

**State-freeze timestamp:** 2026-07-12T14:17:19-07:00

**Scope:** Exact-main Preview, rollback, non-production provider proof, and Production go/no-go.
**Design caveat:** The current UI and design system are not final. This pass avoids visual churn and does not implement the planned discovery-card/navigation overhaul.

No credential values, customer identities, database URLs, cookies, private provider URLs, or webhook signing values are recorded here.

## Executive status

**Final verdict:** **NO-GO for Production users and NO-GO for money.** The exact-main Preview runtime error is fixed and the public read path is healthy, but dark Production auth, signed Stripe webhooks, the Production Doppler contract, functional rollback, Supabase tenant/storage/ledger hardening, and remote Mapbox-canvas proof are not green. No Production promotion was performed.

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

Pending controlled execution.
