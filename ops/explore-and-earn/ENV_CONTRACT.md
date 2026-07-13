# Explore&Earn environment contract

**Status:** Phase 2 controlled-Preview contract, values intentionally omitted
**Authoritative secret store:** Doppler project `explore-and-earn`  
**Runtime:** Vercel project `explore-and-earn`

This contract records names and placement only. It is not evidence that a
write-only value has the correct provider identity. A Production value is not
to be copied from an older Vercel record into Doppler; it must be reissued or
verified at the named provider and installed through the replacement-first
procedure.

Legend: `yes` means the name is present in the Doppler lane at the Phase 2
checkpoint; `partial` means only the listed subset is present; `no` means
absent; `n/a` means the setting is deliberately not part of that lane. Vercel
branch bindings are reported separately and do not imply Doppler or Production
completeness.

## Runtime contract

| Name or group | Provider source of truth | Consumer | Doppler dev / stg / prd | Required Vercel placement | Phase 2 status | Safe action / approval gate |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Canonical Vercel alias / owned domain | metadata, sitemap, email links, Stripe return URLs | no / no / no | Development, branch Preview, Production; different value per lane | Phase 2 branch binding installed; protected owned auth origin `phase2-readiness.exploreandearn.com` is alias-bound only to the evidence candidate; Doppler and Production unchanged | Branch binding is safe and non-secret. The evidence origin is not canonical Production; Production remains `https://exploreandearn.com` and its unchanged record is not launch approval |
| `NEXT_PUBLIC_APP_VERSION` | Git commit SHA or release identifier | `apps/web/instrumentation.ts` | no / no / no | Preview and Production at build time | Phase 2 branch version installed; Doppler and Production unchanged | Safe to derive per deployment; do not freeze a stale SHA in Doppler |
| `PREVIEW_MAP_FIXTURES` | Readiness procedure, not a provider | `apps/web/components/discovery/data.ts` | n/a / no / n/a | Phase 2 branch Preview only | Installed only on the Phase 2 branch; remote Chrome proof passed with five markers and attribution; absent from Doppler and Production | Retain only while the controlled branch remains evidence-bearing. Code and CI prevent Production use; remove before branch convergence |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dark Production instance | Clerk provider, middleware, server auth | yes / no / no | Phase 2 branch Preview, then Production only after promotion approval | Verified pair installed only on the Phase 2 branch; one-user sign-up/login/logout/profile/account-portal proof passed on the protected owned Preview origin; general Preview and Production unchanged | Never mix instances. Production placement requires two-user tenant/RLS, webhook, admin/recovery, and Production rollback proof |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook endpoint | `apps/web/app/api/webhooks/clerk/route.ts` | no / no / no | Phase 2 branch Preview; Production gets its own endpoint secret later | Missing everywhere at freeze | Safe only after the exact Preview endpoint exists and the signature test passes; do not reuse a different endpoint's secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Application route contract | Clerk redirects and auth UI | yes / no / no | All app lanes at build time | Non-secret sign-route bindings installed on the Phase 2 branch; stg/prd Doppler and Production unchanged | Safe route values are `/sign-in` and `/sign-up`; keep them paired with the matching Clerk instance/origin configuration |
| `ADMIN_CLERK_USER_ID` | Founder's recoverable Clerk user | `apps/web/lib/admin.ts` | no / no / no | Server-only Production and any explicit admin-test Preview | Deliberately absent; admin remains locked | Requires founder decision on the recoverable Production admin identity. Never infer from a test user |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dedicated Supabase project | public/authed DB and Storage clients | yes / yes / no | Development; Phase 2 branch Preview; Production after contract completion | Verified dedicated-project pair installed on the Phase 2 branch; general Preview and Production unchanged; prd Doppler absent | Branch-scoped Preview proof is safe. Production requires provider-identity verification and approval |
| `SUPABASE_SERVICE_ROLE_KEY` | Dedicated Supabase project | admin, moderation, Clerk webhook, cron server paths | yes / no / no | Server-only; never client-readable | Missing from stg/prd Doppler; older Vercel identity not accepted as proof | Do not copy or infer. Reissue/verify provider-side, install server-only, then exercise least-privilege admin/cron tests. Founder must select admin/recovery identity |
| `STRIPE_SECRET_KEY` | Dedicated Explore&Earn Stripe account | Checkout, billing portal, Stripe service | yes / yes / no | Server-only; test key on Preview, live key on Production only after money approval | Preview test key present; prd Doppler absent | Test branch placement is safe after account fingerprint verification. Live placement or use requires written migration plan and founder approval |
| `STRIPE_WEBHOOK_SECRET` | Exact Stripe webhook endpoint | Stripe signature verification | no / yes / no | Server-only and endpoint-specific | A controlled locally generated value is installed in Doppler stg and the Phase 2 branch. It proved remote valid/replay HTTP 200 and invalid-signature HTTP 400 for a synthetic ignored event, but it is **not** a Stripe provider endpoint secret | Replace only after a test-mode Stripe endpoint supplies its endpoint-specific secret and provider delivery passes. A handled-event ledger and live endpoint remain separate approved money work |
| `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PROFESSIONAL_MONTHLY`, `STRIPE_PRICE_PROFESSIONAL_YEARLY`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_YEARLY`, `STRIPE_PRICE_ANNOUNCEMENT` | Dedicated Stripe catalog | `apps/web/services/stripe/index.ts` | yes / yes / no | Preview test IDs; Production live IDs only with matching secret key | Test catalog present; Production contract absent | Never mix test/live IDs. Production mapping requires a catalog-by-catalog written review and money approval |
| `STRIPE_PRICE_BOOST_7D`, `STRIPE_PRICE_BOOST_14D`, `STRIPE_PRICE_BOOST_28D` | Dedicated Stripe catalog | optional boost Checkout mapping | yes / yes / no | Same mode as Stripe secret; optional because code has inline-price fallback | Test names present; Production absent | Test-only verification is safe. Live mapping remains under the money approval gate |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Dedicated Stripe account | Declared in the manifest; no current runtime read found | yes / yes / no | Only if a future client-side Stripe consumer is introduced | Not a current runtime requirement | Do not add merely for symmetry; keep mode paired if a consumer is added |
| `RESEND_API_KEY` | Resend, domain-scoped sending key | `packages/mailer/src/index.ts` | yes / yes / yes | Server-only in all sending lanes | Present; controlled message is `delivery_delayed` | Keep current key as rollback. Do not rotate until delivery/reply and zero-use criteria pass |
| `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL` | Verified Resend identity and founder-owned mailbox | `packages/mailer/src/index.ts` | yes / yes / yes | All sending lanes | Sender verified; Reply-To domain has no root MX | From is correct. Reply-To requires founder mailbox/MX decision and receipt/reply proof before customer use |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox token `pass5-public-explore-and-earn` | `apps/web/components/map/MapView.tsx` | yes / yes / yes | Build-readable in all app lanes; origin-restricted | The browser-used Preview token matches the E&E Doppler staging token without value disclosure, so the old/shared token is not needed by this build. The owned protected origin rendered one canvas, five markers, attribution, and zero browser warnings/errors; allowed-origin probes returned 200 and an unrelated-origin probe returned 403; Production is unchanged | The automation credential cannot authenticate, so no fresh provider mutation is authorized or claimed. Do not remove origins or retire the shared token before Production use plus an observation/zero-use window |
| `MAPBOX_ACCESS_TOKEN` | Mapbox automation token | deployment/admin tooling only | yes / yes / yes | Not required by the web runtime | Stored in Doppler but rejected for the attempted provider operation; not a client value | Treat provider mutation as blocked by invalid automation credential. Keep server/tool-only and never substitute it for the public token |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Dedicated Sentry project | server/edge and browser instrumentation | yes / yes / no | Preview and Production runtime; client DSN build-readable | Verified pair installed on the Phase 2 branch; prd Doppler and Production unchanged | Branch proof is safe. Production mapping still requires provider identity confirmation |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry organization/project | Vercel build source-map upload | yes / partial: runtime pair only / no | Build environment; auth token server/build-only | Source-map/release upload not proven | Org/project are safe non-secret mappings after verification. Token must be issued/scoped provider-side; no Production copy/inference |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Dedicated PostHog project | `apps/web/app/providers.tsx` | yes / yes / yes | Build-readable in all app lanes | Verified pair installed on the Phase 2 branch; Production unchanged | Keep consent gate, opt-out default, replay off, console capture off; provider-level privacy settings still need review |
| `RESEND_*`, `NEXT_PUBLIC_POSTHOG_*`, `NEXT_PUBLIC_MAPBOX_TOKEN` | Respective venture providers | email/analytics/map | yes / yes / yes | As above | These are the only complete prd Doppler provider groups | Presence is not sufficient for promotion; use the per-provider evidence gates above |
| `CLOUDINARY_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Shared Cloudinary environment | No direct runtime env consumer found in current source; existing URLs remain in data/content | yes / no / no | None until an upload/admin consumer is designed | Shared account is not transfer-grade | Do not migrate assets or add admin credentials. Founder decision/paid separation plan required |
| `CRON_SECRET` | Newly generated per environment | `apps/web/lib/cronAuth.ts` | no / no / no | Server-only Production; optional isolated Preview cron test | Missing | May be generated and installed only when the corresponding scheduler header is installed and tested. Do not enable Production schedules in this pass |
| `AI_GATEWAY_API_KEY`, `ASSISTANT_MODEL` | Vercel AI Gateway / approved model contract | assistant pages and API | no / no / no | Server-only key; model name may be public | Optional feature remains gracefully disabled | No blocker for core launch. Enabling spend/model use requires founder product/cost decision |

## Tooling-only contract

`DOPPLER_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, project refs,
`DATABASE_URL`/`SUPABASE_DB_URL`, `SUPABASE_JWT_SECRET`, provider personal API
keys, GitHub tokens, and agent-dispatch webhook credentials are operator or CI
inputs. They must not be copied into the Vercel application runtime. The
repository RLS test currently accepts legacy JWT-secret inputs; Phase 2 does
not treat that as a substitute for two real Clerk session tokens.

## Controlled Preview origin

`phase2-readiness.exploreandearn.com` is an evidence-only owned origin for the
corrected Preview candidate. It is backed by a new GoDaddy A record, attached
only to the immutable Preview deployment, certificate-issued, and protected by
Vercel authentication. It allowed the Clerk Production instance to be tested
on an owned venture domain without moving `exploreandearn.com` or any
Production alias. It is not a Production promotion and must remain isolated
until it is deliberately reused for approved readiness work or safely removed
after the evidence branch is retired.

## Promotion invariant

A lane is complete only when all four conditions hold:

1. the name exists in Doppler;
2. a provider-side identity/fingerprint check proves the value belongs to
   Explore&Earn and has the intended test/live mode;
3. Vercel contains the correctly scoped build/runtime binding; and
4. the exact deployment exercises the consumer without leaking the value.

At this Phase 2 checkpoint, the controlled branch has its dark Clerk pair and
sign routes, validated Supabase/Sentry/PostHog pairs, branch app URL/version,
and Preview-only map fixture gate. Single-user dark auth, remote map rendering,
application-layer webhook signature/replay behavior, and Preview deployment
rollback mechanics pass. Those branch bindings do not alter or complete
Production. `prd` still fails the invariant for Clerk, Supabase, Stripe,
Sentry, admin/recovery, cron, and support-mail receipt. The locally generated
Stripe webhook value is not provider-issued delivery evidence, and the Mapbox
automation credential cannot authorize a new provider mutation. No Production
promotion or credential retirement is authorized.
