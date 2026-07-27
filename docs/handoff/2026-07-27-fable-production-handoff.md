# Handoff to Fable 5 — Explore & Earn, one pass to production

**From:** Claude Opus 5
**Date:** 2026-07-27
**Authority:** Founder (jackson@automatedempires.com) granted full authority. Ship it.
**Supersedes:** every earlier handoff in this repo. Where an older doc disagrees with this one, this one wins.

---

## 0. Read this first

You are the implementer. You write the code, you run the migrations, you push the
buttons, you launch. Nothing in this document is a suggestion — it is an ordered
sequence, and the last step is a live production marketplace taking real money.

**Do not stop between steps to ask permission.** The founder has already granted
full authority and has explicitly said he will not be provisioning anything. Two
exceptions only, both flagged inline: entering a payment card, and the two open
questions in §5.

**Helper agents: use cheaper models than yourself.** You are the heavy execution
engine — stay on the code path. When you need an audit sweep, a verification
pass, a "did I miss any call sites" search, or an adversarial review, spawn a
subagent with an explicit `model` override:

- `model: 'sonnet'` — mechanical sweeps, call-site enumeration, test-writing,
  doc drift checks, "grep everything and tell me what's left". Most helper work.
- `model: 'opus'` — adversarial review of money paths, RLS/permission reasoning,
  anything where being wrong costs the founder money or leaks tenant data.
- Never spawn a helper on `fable`. That is you, and you are the expensive one.

Batch independent helpers into a single message so they run concurrently.

---

## 1. Access — verified, you have it

Checked live this session. You inherit all of it.

| Surface | Status | How |
|---|---|---|
| GitHub `AutomatedEmpires/explore-and-earn` | ✅ full | `gh` authenticated in WSL |
| Vercel project `explore-and-earn` | ✅ full | `vercel` CLI authenticated; Vercel MCP tools also connected |
| Doppler `explore-and-earn` / `prd` | ✅ full | `doppler` CLI authenticated |
| Supabase project (E&E prod) | ✅ full | Supabase MCP tools authenticated — `execute_sql`, `list_migrations`, `get_advisors` |
| Sentry | ✅ read | Sentry MCP tools connected |
| Stripe | ⚠️ **no CLI, no MCP** | Dashboard only, via `mcp__computer-use__*` or Chrome MCP under jackson@automatedempires.com |
| Clerk | ⚠️ **no CLI, no MCP** | Dashboard only, same route |
| Cloudinary | MCP connected — but you are **deleting** this dependency, see §4 |

**Known access limits, do not waste time rediscovering them:**

- `vercel env pull` returns **blank values** for sensitive vars. It confirms a var
  *exists*, never what it is. Read real values from Doppler.
- `ae` is **not** on the Bash tool's PATH — the Bash tool is Git Bash on Windows,
  not WSL. Run `ae` from PowerShell, or `wsl -d Ubuntu-24.04-Recovered -- ae …`.
- Inline `bash -lc` breaks `$HOME` resolution on this machine. **Write scripts to
  `/tmp/*.sh` and run `bash -l /tmp/x.sh`.** Every multi-step WSL command.
- You may not type API keys or card numbers into fields. If a step genuinely
  requires it, stop and tell the founder exactly what to paste and where.

---

## 2. Where we are, exactly

**Canonical clone:** `/home/jackson/automatedempires/ventures/explore-and-earn`
(WSL `Ubuntu-24.04-Recovered`). There is exactly one. Never make another.

**Branch state:**

- `main` @ `fa86584` — PRs #279 (host_profiles policy closure) and #280 (match
  score divergence) merged and deployed.
- `integration/readiness-wave` @ `5152733` — **PR #283**, open, ~10.8k
  insertions. Contains migrations 082–085 plus the money-path fixes.
  **All CI checks pass** (verify, verify-local-database, migration-guard,
  design-guardrails, CodeQL, Vercel preview). `mergeStateStatus: BLOCKED` is the
  review gate, not a test failure.
- `claude/comprehensive-audit-20260726` — **PR #281**, the full application
  audit. **8 unresolved review threads.** Doc-only; land it, don't let it rot.
- `dependabot/npm_and_yarn/next-15.5.21` — **PR #282**, next 15.5.20 → 15.5.21.

**Test posture:** 869 db tests, 769 web tests, 10 connected SQL suites — all
green. Gate verdict at last run: `moneySafe: true`, `integrated: true`,
**ship-with-fixes**.

**What migrations 082–085 do (all unapplied in prod, CI applies them on merge):**

- `082_host_self_publish` — hosts publish their own listings. Before this, **no
  listing could ever go live.** This is the single change that turns the product
  from a demo into a marketplace.
- `083_entitlement_enforcement` — tier limits enforced in the database, not just
  the UI.
- `084_host_applicant_read_bridge` — hosts can read their applicants.
- `085_tier_features_and_addons` — tier feature flags and the additional-listing
  add-on.

**Production reality you must internalise:** the production database is
**completely empty** — zero rows in every marketplace table. Nothing is at risk
of corruption, and nothing exists to migrate. You are launching from zero. That
is a gift: no backfill, no data migration, no compatibility window.

**Money state:** `STRIPE_SECRET_KEY` (live) is in Doppler `explore-and-earn/prd`.
It is **deliberately not yet in Vercel** — I held it there until the two money
defects in §6 Step 2 are fixed. The Stripe account has been cleaned: four dead
webhook endpoints pointing at a deleted Supabase project were removed, and the
two missing `checkout.session.async_payment_succeeded` / `async_payment_failed`
events were added (without them, a bank-debit payer is charged and never granted
their tier).

---

## 3. Locked founder decisions — do not relitigate

These are settled. Build to them.

1. **No free tier. Ever.** No host creates a profile or publishes anything for
   free. Every host is on Starter, Pro, or Enterprise. The string
   "Free launch pilot" in `plans.ts` is a lie and must not survive to launch.
2. **Pricing** (`packages/contracts/src/pricing.ts`, already locked in code):
   Starter $199/mo · $1,990/yr — Pro $399/mo · $3,990/yr — Enterprise $749/mo ·
   $7,490/yr. Founding-host $149 / $299 / $599, hard cap 100.
3. **Hosts self-publish.** No admin approval gate on publication.
4. **Pay is defined per listing**, expressible as "from" / "starting at" X.
5. **Team seats and analytics are included per tier** — they are features of the
   tier, never separately-sold products.
6. **Additional listings are an add-on**, priced by tier.
7. **Payments live before launch. Today.** Not staged, not 3–5 days.
8. **Cloudinary is being removed entirely.** See §4 — this is a new decision from
   this session and it changes work you may find planned elsewhere in the repo.
9. **Remove unbacked claims rather than build them.** Standing founder rule. If
   the UI promises something the code does not do, delete the promise. Never ship
   a verification badge, trust indicator, or guarantee that implies more
   protection than actually exists.

---

## 4. The Cloudinary decision — new, act on it

**Audited this session:** Cloudinary holds 631 assets. The application references
**19 of them — 3%.** Specifically: 13 slugs in `apps/web/lib/curatedPhotos.ts`,
10 hero/region slugs across `categoryLanding.ts` and `home-data.ts`, and 11
inline `cloudinaryPhoto()` literals (19 after dedup). There are **zero**
`cloudinaryIllustration()` call sites and **zero** `cloudinaryElement()` call
sites — despite a CSP `connect-src` exception that exists solely to let
illustration SVGs load. `photoBuckets.ts` has **zero** non-null `publicId`s and
two explicit `publicId: null` "to populate" slots.

Cloudinary is on the Free plan at 1.48/25 credits (5.9%), $0/month. It is not
costing money today, but it is a whole vendor, a CSP exception, an env triplet
and a delivery abstraction carrying 19 images.

**Founder decision:** rip it out. He does not want the existing logos or photos —
new brand assets are being created, and the photography will be re-queried from
Unsplash. **Nothing in Cloudinary needs preserving**, including the six
`*-logo-*` assets I had previously flagged as unrecoverable. Supabase Storage
starts completely fresh. The Supabase org is on **Pro**, so Image Transformation
is available and covers the resize/format work `t_ee-{size}` was doing.

Sequenced as Step 7 in §6. Do not do it before payments are live.

---

## 5. Two open questions I did not answer for you

I held both rather than guess. Ask the founder once, in a single message, at the
start of your session — then proceed with the rest of the sequence while you wait.

1. **Team seats are 0 for every tier.** `TEAM_SEATS_BY_TIER` in
   `packages/contracts/src/pricing.ts` is `0` across Starter, Pro, and
   Enterprise. The founder said seats are *included per tier* — which means the
   current values contradict a locked decision, and shipping them would put an
   empty promise in the pricing table. **I deliberately left them at 0 rather
   than invent numbers**, because a wrong seat count is a billing promise you
   cannot walk back. Get three integers. If the founder does not answer before
   you reach the launch gate, **remove the seats claim from the pricing UI
   entirely** — per locked decision #9, deleting the claim beats shipping a lie.

2. **`ADDITIONAL_LISTING_MAX_PER_CHECKOUT = 10`** is marked
   "AWAITS FOUNDER CONFIRMATION" in code and sits on a live paid path. Confirm
   the cap or change it. Do not ship a number carrying that comment.

---

## 6. The one pass to production

Do these in order. Each step has a completion test. Do not advance on a step
whose test has not actually passed — "it should work" is not a test result.

### Step 1 — Take the lease, sync, orient

```bash
ae start explore-and-earn -t production-launch -a fable
```

Then `git fetch --all`, check out `integration/readiness-wave`, confirm HEAD is
`5152733` or later. Run the full local validation set once so you know your
baseline is green before you touch anything:

`pnpm typecheck && pnpm test && pnpm build`

**`pnpm build` is not optional.** It is how the last CI failure got through four
local validation passes — see §7.

**Test:** all three exit 0, HEAD matches origin.

### Step 2 — Fix the two remaining money defects, then merge #283

Both were found reviewing #283 and both are live-money bugs. Fix them **on
`integration/readiness-wave`, before the live Stripe key ever reaches Vercel.**

**(a) The over-allowance sweep is one-way and fires on reversible states.**
When a subscription's listing allowance drops, the sweep closes listings — but it
triggers on Stripe states that are *recoverable*: `paused`, `unpaid`,
`incomplete`. A stale or out-of-order webhook can therefore take a paying host's
live listings down, and the only route back is manual. Fix: restrict the sweep to
terminal states, and make the restoration path automatic when the subscription
returns to `active`.

**(b) An approved full-plan refund cancels the separately-billed add-on as
unrefunded collateral.** The host loses the add-on they paid for and is not
refunded for it. Fix: either refund the add-on alongside, or leave it intact.
Pick one and make the code say which, explicitly.

Then resolve the outstanding review threads on #283 and merge. Merging applies
migrations 082–085 to production **via CI**.

**Test:** `mcp__…__list_migrations` shows 082, 083, 084, 085 applied in prod, and
`get_advisors` returns no new security findings.

> ⚠️ **Never apply a migration by hand** — not via Supabase Studio, not via MCP
> `apply_migration`. Studio/MCP applies write timestamp-format rows into the
> ledger, which diverges from the `NNN_slug.sql` files and makes `db push` abort
> for everyone afterwards. This has already cost this estate a full outage. **Let
> CI apply.**

### Step 3 — Wire the live Stripe key into Vercel

Read the live values from Doppler `explore-and-earn/prd` and set them on the
Vercel **production** environment: `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

**Test:** `vercel env ls production` lists all three (values will read blank —
that is expected and is not a failure).

### Step 4 — Live-mode Stripe products, prices, and webhook

In the Stripe dashboard, in **live mode**, create products and prices that match
`packages/contracts/src/pricing.ts` exactly — all six plan prices plus the three
founding-host prices plus the additional-listing add-on. Then wire the price IDs
back into whatever `resolveStripePriceId` reads.

Create the live webhook endpoint at `https://<production-domain>/api/stripe/webhook`
and subscribe **at minimum**: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`. Copy the signing secret into Doppler and Vercel.

> 🚫 **Never touch LogLoads' or Sweepza's Stripe keys.** Different accounts,
> different companies. The machine-level Stripe and Resend connectors resolve to
> Explore & Earn — which is correct *here* and wrong everywhere else. Providers
> are fixed per product.

**Test:** Stripe dashboard shows the endpoint receiving a successful test event,
and every price ID in code resolves to a live price.

### Step 5 — One real end-to-end subscription

This is the step that proves the product. Sign up as a host, choose a tier, pay
with a real card, and verify the full chain: checkout completes → webhook
received → entitlement granted → host can publish a listing → listing is visible
to a signed-out visitor.

**The founder enters the card. You do not.** Set the flow up, tell him exactly
what to click, and verify everything downstream once he has.

Then verify the reverse: refund/cancel, and confirm the entitlement is revoked
and the listing behaviour matches what you decided in Step 2(b).

**Test:** a real charge appears in Stripe live mode, the host row shows the
granted tier, a published listing renders for an anonymous visitor, and the
cancel path revokes cleanly.

### Step 6 — Admin, notifications, backups

- Set `ADMIN_CLERK_USER_ID` in Doppler + Vercel. **Without it there is no
  production admin at all** — nobody can moderate, suspend, or intervene.
- Move the notifications ladder from `ledger_only` to `enabled`. Verify the
  Resend sending domain first; if it is unverified, verify it or leave
  notifications at `ledger_only` and say so plainly rather than shipping a
  silent failure.
- Enable Supabase backups / PITR. **There are none today.**

**Test:** admin routes authorise for the founder's Clerk user; one real
notification email arrives; the Supabase dashboard shows a backup policy.

### Step 7 — Cloudinary out, Supabase Storage in, fresh brand assets

Only now, with money live.

1. Generate the new brand assets (logos, wordmark, favicons, OG images) and put
   them in Supabase Storage.
2. Re-query Unsplash for the ~19 photographs the app actually uses. Preserve the
   slug/category shape so `curatedPhotos.ts`, `categoryLanding.ts` and
   `home-data.ts` change values, not structure. Honour Unsplash attribution
   requirements and the existing people-safety skip.
3. Replace `packages/ui/src/cloudinary.ts` with a Supabase Storage helper that
   uses the Pro-plan Image Transformation params in place of `t_ee-{size}`.
4. Delete: the `cloudinaryIllustration` / `cloudinaryElement` helpers (zero call
   sites), the CSP `connect-src` exception that existed only for illustration
   SVGs, and every `CLOUDINARY_*` env var from Doppler and Vercel.
5. Fill or delete the two `publicId: null` bucket slots. Do not leave them.

**Test:** zero matches for `cloudinary` in `apps/` and `packages/` outside of
deleted-file history; the home page, a category landing page and a listing detail
page all render their images from Supabase Storage in production.

### Step 8 — Land the stragglers

- **PR #281** (the audit) — resolve the 8 open threads, merge. It is the
  investor/technical-leadership artefact; it should not sit stale.
- **PR #282** — next 15.5.21 bump. Merge once green.
- **The 082 column revoke.** `docs/security/policy-host-identity-helpers.md`
  specifies it and it is still open: migration 081 rewrote 11 policies onto
  `SECURITY DEFINER` helpers but **revoked nothing**. The actual column revoke
  plus ~24 call sites remain. ⚠️ **Numbers 082–085 are now taken** — this
  becomes 086. Two of those call sites discard the error, so a failed revoke
  fails *silently*; fix those first. The dev bench runs as `service_role` and
  therefore proves nothing about this — verify against real `anon` /
  `authenticated` roles.
- Fix README / AGENTS.md drift so the next agent is not misled.

### Step 9 — Launch gate

Every one of these, verified, before you call it done:

- [ ] Migrations 082–085 applied in prod; `get_advisors` clean.
- [ ] A real card has been charged and a real entitlement granted (Step 5).
- [ ] Refund/cancel revokes correctly.
- [ ] `ADMIN_CLERK_USER_ID` set; admin reachable.
- [ ] Backups/PITR on.
- [ ] Zero Cloudinary references; images serve from Supabase Storage.
- [ ] No "Free launch pilot" string, and no free-tier path, anywhere in the UI.
- [ ] Team seats: real numbers shipped, **or** the claim removed (§5.1).
- [ ] `ADDITIONAL_LISTING_MAX_PER_CHECKOUT` confirmed, comment removed (§5.2).
- [ ] Production domain resolves, TLS valid, Vercel production alias correct.
- [ ] Sentry shows no unhandled errors on the signup → pay → publish path.
- [ ] Signed-out visitor can browse, and a published listing is crawlable.
- [ ] `ae finish explore-and-earn` — validates, secret-scans, pushes, verifies
      the remote SHA. **Pushed or it didn't happen.**

Then report to the founder: what is live, what you verified and how, and
anything you consciously left out. Do not report completion while any box above
is unchecked — say which, and why.

---

## 7. Hiccups and traps — every one of these cost real time

**Build / CI**

- **`pnpm build` must be in your validation set.** A Next.js route module may
  only export the HTTP verbs plus a fixed set of segment-config keys. We exported
  a constant from `app/api/stripe/webhook/route.ts` and it broke the production
  build — `tsc -b` cannot see this, because the route-type contract is generated
  into `.next/types` during `next build`. Four local passes missed it; CI caught
  it. Fixed at `5152733` by moving the constant to `apps/web/lib/routePaths.ts`.
- **Local `next build` OOMs at the default heap on this machine.** This is
  environmental — `origin/main` OOMs identically. Raise the heap; do not go
  hunting for a memory leak you introduced.
- **`ae finish` can report VALIDATION-FAILED spuriously** when the exact same
  command exits 0 run directly. Check the artefact, not the exit code.

**The `ae` control plane**

- Lease before writing: `ae start <repo> -t <task> -a fable`. One writer per
  repo. Respect other agents' leases (`ae locks`).
- While leased, push as `AE_AGENT=fable git push`.
- The pre-push secret scanner blocked us twice on a **fictional** connection
  string in documentation — its pattern is
  `postgres(ql)?://[^ :/]+:[^ @]{6,}@` with no allowlist. **Fix at the source**
  (shorten the fake password, or don't use a URL shape). **Never `--no-verify`.**
- Squash merges make ancestry lie. Before integrating any branch that *looks*
  unmerged, get a content verdict: `ae verify explore-and-earn <branch>`.
- `ae doctor` only sees the checked-out branch.

**Database / RLS — hard-won, do not rediscover**

- A column referenced **only in a `WHERE` clause** still requires `SELECT` on
  that column. Same for `UPDATE … WHERE col` and `.is(col, null)`.
- Revoking a *column* privilege is a **silent no-op** while a *table* grant
  exists.
- A policy on its own table is owner-evaluated — but a **cross-table sub-select
  inside a policy IS permission-checked against the invoking role**, and **`OR`
  branches do not short-circuit** that check. `SECURITY DEFINER` helpers are the
  fix.
- `pg_policy.polroles` stores PUBLIC as **OID 0**, and `pg_roles` has no row with
  OID 0 — name-based checks miss it entirely. Migration 081's guard DO-block
  handles this; copy the pattern.
- Enumerate policies from `pg_policy`. **Never by grepping migrations.**

**Testing**

- `packages/db/src/queries/*` imports `server-only`, so vitest cannot load it.
  That is why `storedMatchDecode.ts` lives in `packages/db/src/lib/`, not
  `queries/`. Keep pure decode logic out of `queries/`.
- `apps/web` is `jsx: preserve`, so vitest cannot transform `.tsx`.
- A migration, the `SELECT`/grant it depends on, and the app change that reads it
  are **one atomic unit**. Splitting them across PRs has already caused a
  production outage in this estate.
- Test the *refusal*, not just the happy path. And test sanitiser **output**
  invariants, not input.

**Design guardrails**

- The raw-colour ratchets (G50/G51/G52) **scan comments**. A bare `#276` (a PR
  number!) or an `rgb(...)` inside a comment fails the build. This has bitten
  twice. Never "fix" it with `--update`.
- The db-assert guardrail scans SQL — strip `--` comments before a negative
  assertion, or a migration's own explanatory header will fail its own check.

**Process**

- If you delegate, give the subagent the exact worktree path and confirm it
  exists. I once told fix-agents to use worktrees I had never created; they
  adapted by working elsewhere and left ~5,500 lines stranded. Verify what came
  back is where you think it is.
- `isolation: 'worktree'` fails when the session CWD is not a git repo — this
  session's CWD is `C:\Users\autom\Documents\claude`, which is not one. Create
  worktrees manually.

---

## 8. What not to do

- Do not create a second clone of this repo, anywhere, for any reason.
- Do not apply migrations by hand (Studio or MCP `apply_migration`). CI applies.
- Do not bypass the secret scanner with `--no-verify`.
- Do not use LogLoads' or Sweepza's Stripe/Resend connectors.
- Do not blanket `vercel env pull` into `.env.local` — it aims local dev at the
  shared production database.
- Do not ship a claim the code does not back. Delete the claim instead.
- Do not report "committed" without push **and** remote-SHA verification.
- Do not inflate completion. If something is partial, mocked, or dark, say so in
  those words.

---

## 9. Honest assessment of what you are inheriting

The engineering is good and the tests are real. Three review rounds converged
from six blockers to two, and the two that remain (§6 Step 2) are both fixable in
a sitting. The database is empty, which means there is nothing to break and no
migration risk. The Stripe account is clean and the live key is one `vercel env`
call away from being active.

The genuine risk is not code quality — it is that the marketplace launches with
zero listings, because production has never had any and hosts must now pay before
they can publish. That is the model the founder chose, and it is coherent, but it
means launch day is an acquisition problem, not an engineering one. Flag it,
don't solve it unasked.

Everything else is sequencing. Work the list.

— Claude Opus 5
