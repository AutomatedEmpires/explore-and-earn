# Explore&Earn environment contract

**Status:** Phase 2 readiness contract, values intentionally omitted  
**Authoritative secret store:** Doppler project `explore-and-earn`  
**Runtime:** Vercel project `explore-and-earn`

This contract records names and placement only. It is not evidence that a
write-only value has the correct provider identity. A Production value is not
to be copied from an older Vercel record into Doppler; it must be reissued or
verified at the named provider and installed through the replacement-first
procedure.

Legend: `yes` means the name was present in the Doppler lane at the Phase 2
freeze; `partial` means only the listed subset was present; `no` means absent;
`n/a` means the setting is deliberately not part of that lane.

## Runtime contract

| Name or group | Provider source of truth | Consumer | Doppler dev / stg / prd | Required Vercel placement | Phase 2 status | Safe action / approval gate |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Canonical Vercel alias / owned domain | metadata, sitemap, email links, Stripe return URLs | no / no / no | Development, branch Preview, Production; different value per lane | Missing from Doppler | Safe to set as non-secret after the exact Preview alias is stable; Production must remain `https://exploreandearn.com` and is not a launch approval |
| `NEXT_PUBLIC_APP_VERSION` | Git commit SHA or release identifier | `apps/web/instrumentation.ts` | no / no / no | Preview and Production at build time | Exact-main branch override exists; Doppler absent | Safe to derive per deployment; do not freeze a stale SHA in Doppler |
| `PREVIEW_MAP_FIXTURES` | Readiness procedure, not a provider | `apps/web/components/discovery/data.ts` | n/a / no / n/a | Phase 2 branch Preview only | New, intentionally absent | Safe to set to `1` only on the Phase 2 branch. Code and CI prevent Production use. Remove after remote Mapbox proof |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dark Production instance | Clerk provider, middleware, server auth | yes / no / no | Phase 2 branch Preview, then Production only after promotion approval | Current general Vercel records use the development identity; dark branch binding absent | Install only as a verified pair from the dark instance. Never mix instances. Production placement requires successful Preview auth/RLS and rollback proof |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook endpoint | `apps/web/app/api/webhooks/clerk/route.ts` | no / no / no | Phase 2 branch Preview; Production gets its own endpoint secret later | Missing everywhere at freeze | Safe only after the exact Preview endpoint exists and the signature test passes; do not reuse a different endpoint's secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Application route contract | Clerk redirects and auth UI | yes / no / no | All app lanes at build time | Missing in stg/prd Doppler | Safe non-secret values are `/sign-in` and `/sign-up`; install with the matching Clerk instance/origin configuration |
| `ADMIN_CLERK_USER_ID` | Founder's recoverable Clerk user | `apps/web/lib/admin.ts` | no / no / no | Server-only Production and any explicit admin-test Preview | Deliberately absent; admin remains locked | Requires founder decision on the recoverable Production admin identity. Never infer from a test user |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dedicated Supabase project | public/authed DB and Storage clients | yes / yes / no | Development; Phase 2 branch Preview; Production after contract completion | Branch-specific exact-main pair exists; general Preview still points at the old localhost lane; prd Doppler absent | Branch-scoped Preview install is safe from the verified stg pair. Production requires provider-identity verification and approval |
| `SUPABASE_SERVICE_ROLE_KEY` | Dedicated Supabase project | admin, moderation, Clerk webhook, cron server paths | yes / no / no | Server-only; never client-readable | Missing from stg/prd Doppler; older Vercel identity not accepted as proof | Do not copy or infer. Reissue/verify provider-side, install server-only, then exercise least-privilege admin/cron tests. Founder must select admin/recovery identity |
| `STRIPE_SECRET_KEY` | Dedicated Explore&Earn Stripe account | Checkout, billing portal, Stripe service | yes / yes / no | Server-only; test key on Preview, live key on Production only after money approval | Preview test key present; prd Doppler absent | Test branch placement is safe after account fingerprint verification. Live placement or use requires written migration plan and founder approval |
| `STRIPE_WEBHOOK_SECRET` | Exact Stripe webhook endpoint | Stripe signature verification | no / no / no | Server-only and endpoint-specific | Missing everywhere at freeze | Safe to create/install for a test-only Phase 2 endpoint. Live endpoint creation/use is a separate approved money migration |
| `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PROFESSIONAL_MONTHLY`, `STRIPE_PRICE_PROFESSIONAL_YEARLY`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_YEARLY`, `STRIPE_PRICE_ANNOUNCEMENT` | Dedicated Stripe catalog | `apps/web/services/stripe/index.ts` | yes / yes / no | Preview test IDs; Production live IDs only with matching secret key | Test catalog present; Production contract absent | Never mix test/live IDs. Production mapping requires a catalog-by-catalog written review and money approval |
| `STRIPE_PRICE_BOOST_7D`, `STRIPE_PRICE_BOOST_14D`, `STRIPE_PRICE_BOOST_28D` | Dedicated Stripe catalog | optional boost Checkout mapping | yes / yes / no | Same mode as Stripe secret; optional because code has inline-price fallback | Test names present; Production absent | Test-only verification is safe. Live mapping remains under the money approval gate |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Dedicated Stripe account | Declared in the manifest; no current runtime read found | yes / yes / no | Only if a future client-side Stripe consumer is introduced | Not a current runtime requirement | Do not add merely for symmetry; keep mode paired if a consumer is added |
| `RESEND_API_KEY` | Resend, domain-scoped sending key | `packages/mailer/src/index.ts` | yes / yes / yes | Server-only in all sending lanes | Present; controlled message is `delivery_delayed` | Keep current key as rollback. Do not rotate until delivery/reply and zero-use criteria pass |
| `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL` | Verified Resend identity and founder-owned mailbox | `packages/mailer/src/index.ts` | yes / yes / yes | All sending lanes | Sender verified; Reply-To domain has no root MX | From is correct. Reply-To requires founder mailbox/MX decision and receipt/reply proof before customer use |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox token `pass5-public-explore-and-earn` | `apps/web/components/map/MapView.tsx` | yes / yes / yes | Build-readable in all app lanes; origin-restricted | Vercel record spans all targets, but Production bundle still proves the old shared token | Use venture token on the Phase 2 branch and add only the candidate origin. Do not remove old origins or retire the shared token |
| `MAPBOX_ACCESS_TOKEN` | Mapbox automation token | deployment/admin tooling only | yes / yes / yes | Not required by the web runtime | Stored in Doppler; not a client value | Keep server/tool-only. Never substitute it for the public token |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Dedicated Sentry project | server/edge and browser instrumentation | yes / yes / no | Preview and Production runtime; client DSN build-readable | Verified exact-main branch binding; prd Doppler absent | Safe to branch-scope the verified pair. Production mapping requires provider identity confirmation |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry organization/project | Vercel build source-map upload | yes / partial: runtime pair only / no | Build environment; auth token server/build-only | Source-map/release upload not proven | Org/project are safe non-secret mappings after verification. Token must be issued/scoped provider-side; no Production copy/inference |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Dedicated PostHog project | `apps/web/app/providers.tsx` | yes / yes / yes | Build-readable in all app lanes | Branch runtime proof passed in Phase 1 | Keep consent gate, opt-out default, replay off, console capture off; provider-level privacy settings still need review |
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

## Promotion invariant

A lane is complete only when all four conditions hold:

1. the name exists in Doppler;
2. a provider-side identity/fingerprint check proves the value belongs to
   Explore&Earn and has the intended test/live mode;
3. Vercel contains the correctly scoped build/runtime binding; and
4. the exact deployment exercises the consumer without leaking the value.

At this Phase 2 checkpoint, `prd` fails that invariant for Clerk, Supabase,
Stripe, Sentry, admin/recovery, cron, and support-mail receipt. No Production
promotion or credential retirement is authorized.
