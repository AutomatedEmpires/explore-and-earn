# Explore & Earn — agent handoff, 2026-07-18

Written for the next agent (Codex or otherwise) picking up this work.

**How to read this.** Sections 2–6 are **verified state** — checked against the
live database, the deployed app, GitHub, and the repo, not inferred; if something
there is wrong, treat it as a bug in this document. Sections 7–8 are **plans,
founder requirements and workflow guidance** — scoped and evidenced, but not
facts you can go and confirm. Where I was wrong earlier in the session, I say so;
those corrections are the most useful part of this file.

**Sourcing.** Founder requirements (the four housing-photo roles, the explicit
Housing/Meals decision, the Mapbox permanent-storage condition, the FCC
rejection) came from founder directives in the working session that produced this
work — they are product law, not my conclusions. The engineering decisions are
mine and are argued from the code and migrations cited inline. `AGENTS.md` and
`\\wsl.localhost\...\automatedempires\control\POLICY.md` remain authoritative for
anything that conflicts.

---

## 1. The goal, in one paragraph

Explore & Earn is a seasonal/remote work marketplace. Its differentiator is a
product law: **the app must never state something on a host's behalf.** A fact
the host did not state renders as "Not stated" — never as "No", never inferred,
never defaulted. The current programme of work is making that law *actually true*
end to end (it was decorative in several places), and then getting the map and
permanent geocoding working so listings can be found geographically. Production
is live at exploreandearn.com but has **0 listings** — pre-launch. That emptiness
is a resource: schema-shaped fixes that would need a backfill later are free now.

---

## 2. State right now

| Thing | State |
|---|---|
| `main` | `71d829a` — clean, synced, **nothing local-only** (audited) |
| Open PRs | 0 |
| Migrations | prod is at **071**; ledger matches `supabase/migrations/` exactly |
| `db-migrate` pipeline | **working** — 3 consecutive green runs, applies on merge |
| Tests | 733 passing |
| Lease | released (`ae locks` shows explore-and-earn free) |
| Local dev | repaired — every route 200s, map renders locally |

### Where the work happened

- **Canonical clone (the only one that matters):**
  `/home/jackson/automatedempires/ventures/explore-and-earn` (WSL
  `Ubuntu-24.04-Recovered`). Resolve with `ae path explore-and-earn`.
- **A second clone exists** at
  `/home/jackson/.ae/retired/explore-and-earn-typecheck-repair` on branch
  `fix/typecheck-errors`. I audited it: 0 uncommitted, 0 stashes, and its HEAD
  **is** on the remote as `origin/fix/typecheck-errors`. It looks "unmerged"
  because it predates the convergence and was squash-merged — the ancestry lie
  the policy warns about. Nothing there is at risk. Do not resurrect it; it edits
  compiled `.js`/`.d.ts` files main no longer tracks that way.
- **My scratch dir** is `/home/jackson/automatedempires/worktrees/.fable-scratch`
  — **outside** the repo, throwaway shell scripts only. I shredded the three
  credential files I had pulled there (`authoritative.env`, `prod.env`,
  `env.local.backup`) and verified no token-shaped string remains.

---

## 3. What shipped, and why it mattered

Five PRs, all merged, all applied to production.

**#261 — single-source the evidence-honesty copy.** Four render sites had
re-typed `NOT_STATED_LABEL` / `SOURCED_DISCLOSURE_LABEL` as raw string literals,
which made the exported constants decorative — the copy could drift per surface
with nothing to catch it. `apps/web/tests/unit/honesty-labels.test.ts` is now the
ratchet. It asserts the **bare** copy, not a quoted needle: the first version
only matched `"Not stated"` and missed single quotes, backticks and bare JSX text
nodes. Verify a ratchet bites by deliberately regressing the file it guards.

**#262 / #263 — listing relocation intelligence, slices 1 & 2.** Host-reported
connectivity (`listings.logistics`, migration 068) and maritime vessel depth
(`listings.category_depth`, 069). Both dormant by construction: gated on
`hasLogistics()` / `hasCategoryDepth()`, and with 0 listings they render nowhere.

**#264 — Housing/Meals/Pay must be an explicit host decision (070).** The
headline bug: a host who left the housing box blank shipped a listing whose
Housing cell affirmatively read **"Not included", carrying `evidence =
'confirmed'`**. Three things composed — a `benefitIncluded()` fallback that
inferred the answer from whether a *description* was non-empty, an action layer
that never read a provision at all, and `housing_evidence` defaulting to
`'confirmed'` with the only writer being the sourced-ingestion path. The UI even
instructed hosts to trigger it ("Leave blank if not provided"). Net effect:
`not_stated` was **unreachable** for host-authored listings.

**#265 — close the escape hatch (071).** 070's gate exempts *sourced* listings
(they have no host to answer). That exemption keys on `provenance` — and
`authenticated` held a **table-level UPDATE grant on all 67 columns**, so a host
could `PATCH { provenance: 'sourced', status: 'live' }` and walk straight
through. Reviewers then caught that I had closed UPDATE and left **INSERT** wide
open — the same bypass, one verb over. Both are now column allow-lists.

---

## 4. Design decisions you should not re-litigate

These were each argued from evidence. Re-deciding them costs a day.

**No new column for the tri-state.** Migration 064's evidence vocabulary already
*is* it: `not_stated` means "the originating source did not state it", and for a
verified listing **the host is the originating source**. The boolean is the
VALUE; the evidence is WHO SAID IT and whether anyone did. A `housing_provision`
enum would have created a third representation for six mappers, two filters and
the match engine to reconcile.

**Enforcement lives in the database.** It is the only layer on every writer's
path. No grant/revoke on `public.listings` existed before 071; 066 states outright
that Supabase's defaults give `authenticated` full-column UPDATE. An
app-layer-only gate is decorative.

**A column default is a claim made on behalf of anyone who says nothing, so it
must be the WEAKEST claim available.** That is why 070 flips the three evidence
defaults `confirmed → not_stated`. Fixing the app writers alone would have left
the trap armed for the next writer.

**`listing_relevance_extensions` is REJECTED as a home for category depth** —
and *not* on the migration-040 precedent, which actually inverts for
category-scoped data. The real reasons: its only write policy can never match a
sourced listing (064 dropped `host_profile_id NOT NULL`), so writes would affect
**zero rows silently**; and its `display_enabled`/`matching_enabled` default
**true**, so a bare row asserts four things nobody said. Leave the table dormant;
`drop table` is neither additive nor reversible.

**Do NOT build the FCC broadband slice.** Founder-rejected, and independently the
data is modelled outdoor-only — it fails precisely on vessels, barns, lodges and
home offices, which is E&E's whole inventory.

---

## 5. Lessons that will save you real time

**A SELECT-list change is NEVER "dormant".** I shipped 068 calling it dormant
because 0 listings had the data. But adding a column to `LISTING_COLUMNS` means
the whole query throws against a database without it — every route using it 500s
regardless of whether the feature renders. **Migration + SELECT-list change (and
grant + app change) are ONE atomic unit.**

**Compiler-forced sweeps have a hole.** Adding a member to a union makes every
`Record<Union, …>` a compile error — that is how I found 6 label maps. It does
**not** flag a `!==` comparison. `provided={hp !== "not_provided"}` answered
"included" for both `not_stated` and `undefined`, so the discovery card announced
`aria-label="Housing: included"` for a listing nobody had answered. **Only
driving the real UI caught it.** Use allow-lists, not negations, for anything
that decides what to claim.

**Honesty rules must live in contracts, never as private helpers.** An
adversarial pass restored the original "blank means confirmed no" behaviour and
**all 393 tests still passed**, because the rule was module-private. Now
`hostBenefitDecision`, `benefitCardState`, `validateListingForPublication` and
`readBenefitChoice` are exported from `packages/contracts` and tested directly.

**Test the OUTPUT invariant, not the input.** `optionalPositiveNumber`
range-checked the raw value then rounded, so `0.04` exited as `0` — a stated zero
nobody entered. The tests asserted `0` drops as *input*; nothing asserted `0`
can never be *produced*.

**Check whether a pipeline RUNS AND FAILS before believing it never ran.** The
standing note said the db-migrate secrets were unprovisioned. False — they
existed since 2026-07-07, and the workflow had been failing on every merge for
weeks, ~20s each. Nobody read the log.

**Applying migrations via Studio/MCP is what broke the pipeline.** It stamps
14-digit timestamp versions; the repo uses `NNN_slug.sql`. `supabase db push`
aborts when remote holds versions with no local file. I repaired the ledger (45
timestamp rows → real file versions; backup kept at
`supabase_migrations.schema_migrations_backup_20260717`). **Let CI apply
migrations from now on.**

**Never blanket `vercel env pull` into `.env.local`.** Vercel's "Development"
environment points `NEXT_PUBLIC_SUPABASE_URL` at the same hosted project as
production, while local points at the local Supabase stack. Pull surgically.

---

## 6. Environment facts you will need

- **Dev server — use the WEBPACK path, this matters:**
  `pnpm --dir apps/web dev:webpack -p 3100` (verified working; note **no** `--`
  separator — pnpm forwards it to `next` as a directory argument and it dies with
  *"Invalid project directory provided"*).
  The default `pnpm dev` is `next dev --turbopack`, and `apps/web/next.config.ts`
  (see the comment at ~line 127) installs the dev-bench Clerk shim through a
  **webpack alias** — Turbopack does not run it, so the bench silently does not
  work. I got the right behaviour by accident (calling `next dev` directly
  bypasses the `--turbopack` flag); don't rely on that.
  Start it as a PowerShell background task, not `nohup` inside a one-shot `wsl`
  call — that gets torn down when the call returns.
- **Visual testing without auth:** set cookie `ee_dev_role=host` (also `seeker`,
  `admin`). See `apps/web/lib/devBench/` and `apps/web/tests/e2e/smoke.spec.ts`.
  Sanctioned, and structurally impossible in production — `isDevBenchEnabled()`
  is false under `NODE_ENV=production`, which both prod and Vercel preview build
  with, so the shim is not even bundled there.
  **Measured, so you don't chase it:** on this local setup protected routes serve
  200 *without* any cookie, because `middleware.ts` (~line 133) skips Clerk
  protection when Clerk is not configured for the local runtime. Set the cookie
  anyway — it is what gives you a *host-shaped* session (the page renders as
  "New listing · Host") rather than merely reachable markup.
  Also: `curl -L` will follow a redirect to `/sign-in`, which itself returns 200,
  so **check the unfollowed status** or you will read a redirect as success. I
  made exactly that mistake here.
- **Selects cannot be driven programmatically** in this app — synthetic `change`
  events and the browser tool's `form_input` both fail to reach React's handler.
  Read the rendered state instead of trying to script the interaction.
- **Local Clerk was never mis-keyed.** The keys always matched
  (`calm-panther-70.clerk.accounts.dev`, verified against Clerk's API). What was
  missing: `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL`. Clerk's "your
  instance keys do not match" error is a red herring.
- **Mapbox is fully provisioned** — `NEXT_PUBLIC_MAPBOX_TOKEN` in all three
  Vercel environments, plus a server-side `MAPBOX_ACCESS_TOKEN` (which is what
  geocoding needs). The control-plane registry claiming `providers.maps = null`
  is **wrong**.
- **Validation command:** `pnpm typecheck && pnpm guardrails && pnpm test &&
  pnpm lint`, run from the repo **root**.
- **Known flake:** `apps/web/tests/unit/community-photo-privacy.test.ts`
  ("40 megapixels") takes ~4.5s against a 5s default timeout and fails
  intermittently under parallel load. Pre-existing, unrelated to this work.

---

## 7. What to do next

### 7a. The reusable housing-photo library — founder-specified, fully mapped

This is the next build, and it is already scoped. Founder requirement: **Housing
= Included may only publish when four photo roles are complete** — sleeping area,
bathroom, kitchen, dining/common. Labels adapt per category (Maritime: cabin/
berth, head, galley, mess) but the four evidence roles are fixed. Photos come
from a **reusable host-profile library** with **listing-level overrides**; a host
must be able to select a profile photo, replace a slot for one listing, preview
what seekers see, and remove an override to fall back to the default.

Findings that shorten the work:

- **`benefit_details.housing.photos` (migration 040) already IS the
  listing-level slot map** — `Record<slotId, publicUrl>`, deliberately open-keyed
  "so the editor's photo-slot configuration can evolve without a schema change".
  **No migration needed for the listing side.** Two defects: it is not in
  `LISTING_COLUMNS`, and the slot ids are wrong (outside/inside/bathroom/misc).
- **The library wants `host_profiles.benefit_library jsonb`** (migration 072).
  Two gotchas that will silently break it if missed: migration **054 revoked
  blanket UPDATE on `host_profiles`** and pinned a column list — `benefit_library`
  must be added there or hosts cannot write it. And **027 revoked anon SELECT** —
  library photos render on live listings, so `grant select (benefit_library) to
  anon` is required or every signed-out listing page 500s.
- **Storage RLS already authorises it with no migration**: `017` keys
  `listing-media` writes on the first path segment being the caller's
  `host_profile_id`, so `listing-media/{hostProfileId}/library/housing/{role}`
  is already a legal path.
- **REJECT `listing_media_overrides`** (the dormant table from 006/015). Four
  verified disqualifiers: its `enforce_listing_media_override()` trigger requires
  the asset's bucket be owned by the *listing*, so a profile-owned library asset
  can never be referenced (23514); its dependencies `media_assets`/`media_buckets`
  have RLS enabled with **zero policies**; its write policy resolves through
  `host_profile_id`, which is NULL for sourced listings; and no app code touches
  it. Same trap as `listing_relevance_extensions`.
- **There is a live false promise to fix.** `ListingForm.tsx` already tells hosts
  *"Housing and meal photo buckets live on your host profile — upload them once
  and they're reused across every listing"* and links to `/host/profile/edit`,
  which has **no such editor**. Under the no-empty-promises rule this is a
  violation being fixed, not a new feature.
- **Gate it with a TRIGGER, not a row CHECK** — the effective photo set spans
  `host_profiles` and `listings`, so a single-row CHECK would reject a listing
  whose photos legitimately come from the library.
- **Do not ship the photo rule without the library.** It would make every
  existing duplicate unpublishable.

### 7b. Permanent geocoding — needs one founder answer first

Founder approved Mapbox **only if** the existing account and billing permit
**storing permanent** geocoding results under Mapbox's terms. Temporary-result
storage is explicitly forbidden, and substituting another provider needs
approval. So: determine the exact entitlement required and its cost, document it,
build everything up to the provider gate, and continue elsewhere if a new paid
plan is needed.

Scope when unblocked: input normalisation, an explicit geocode action, permanent
storage (lat/lng + canonical display location + confidence/precision), host
confirmation when ambiguous, safe no-result handling, re-geocode only on material
location change, rate/cost controls, **no silent replacement of host-confirmed
coordinates**, tests and observability. Note `LocationContext` currently renders
coordinates at 2dp (~1.1km) as partial sensitive-location protection — any
precision change is a founder call.

**Production's map will show zero markers until this ships** — no listing has
coordinates. The 6 markers visible locally are `PREVIEW_MAP_FIXTURES`.

### 7c. Smaller, genuinely useful

- **Regenerate `packages/db/src/types.gen.ts`** — verified stale by at least
  three migrations. Do it in its own PR; it will surface unrelated errors that
  would otherwise look like your breakage.
- **Reconcile the migration headers.** They still say "never applied by agents /
  REVIEW-ONLY". With the pipeline working, CI applies them — the headers now
  give the next agent a mixed signal.
- **The flaky megapixel test** (see §6).

---

## 8. Ground rules for this repo

1. **One canonical clone.** Never create another. `ae path explore-and-earn`.
2. **Lease before writing:** `ae start explore-and-earn -t <task> -a <agent>`.
   Set `AE_AGENT=<agent>` before `git push` or the hook rejects it.
3. **End with `ae finish explore-and-earn -a <agent>`** — not a bare release. It
   refuses to end on a dirty tree, runs the repo's registered validation,
   secret-scans, pushes, and **verifies the remote SHA**. Interrupted?
   `ae finish <repo> --wip`. Never report "committed" or "done" without also
   reporting **pushed + remote SHA verified**. (Note `ae finish` refuses to close
   while you are on `main` because merging deploys production — do the merge,
   then release.)
4. **Merging `main` auto-deploys to production** via Vercel.
5. **Founder locks:** the four categories (farm|maritime|remote|seasonal + mix)
   and MIX_DOMAIN are locked; the Housing/Meals/Pay triad must never gain a
   fourth key; the design ratchets (G50 raw-colour, G51 tokenisation, G52
   locale-literal) only ever tighten, and **new files get a zero budget** — reuse
   an existing CSS module rather than adding one.
6. **Migration numbers must be pre-reserved** in
   `tools/scripts/migration-allocations.json` or CI fails. Next free: **072**.
7. **Verify claims against the live system.** Most of the expensive mistakes in
   this session came from trusting a note instead of checking.
