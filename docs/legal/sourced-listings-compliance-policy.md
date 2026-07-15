# Sourced Listings — Compliance & Operating Policy

**Status:** DRAFT for counsel review. **Owner:** Founder (Jackson Cole).
**Last updated:** 2026-07-14.

> ⚠️ **Not legal advice.** This document is an internal operating policy and risk
> framework written by the engineering team to make the *product's* behavior
> defensible and to give counsel a concrete starting point. A qualified attorney
> **must review the source allowlist and the public disclosure copy before any
> sourced listing goes live in production.**

---

## 1. Purpose & scope

Explore & Earn is bootstrapping supply honestly: rather than fabricating host
profiles, reviews, or benefits, we surface a thin layer of **sourced** (a.k.a.
"unverified") real job postings as an initial-attraction layer, clearly marked as
not confirmed by us, and we convert them to real host-owned listings via a
claim-to-verify flow. This policy governs **how** we may source, **from where**,
**what we may show**, and **how we respond** to employers.

This policy applies to every listing whose `provenance = 'sourced'` (migration
064). Verified, host-owned listings are out of scope (the host supplies and owns
that content).

## 2. Safeguards already built into the product

The provenance engine (migration 064; `packages/contracts/src/provenance.ts`,
`packages/db/src/lib/sourceIngestion.ts`, `queries/sourcedListings.ts`,
`queries/listingClaims.ts`) enforces the following **structurally**, not by
convention:

1. **Compliance-gated ingestion.** Every source starts `pending_review`. Nothing
   ingests until a human sets `complianceStatus: 'approved'` on that source
   (`upsertListingSourceAction`). Unapproved / unclear sources refuse.
2. **Stated-only extraction.** We extract **facts** the posting states (title,
   location, dates, stated pay / housing / meals). We do not infer, embellish, or
   fill gaps.
3. **`not_stated` is never "no".** Anything the posting didn't state renders as
   **"Not stated"** everywhere — card, detail, ranking, public API — and is never
   silently downgraded to "not included." Matching treats it as UNKNOWN.
4. **Honest disclosure band.** Sourced listings show: *"Sourced · not yet confirmed
   by Explore & Earn — we found this from a public posting; anything the posting
   didn't state is shown as not stated, never assumed."*
5. **No implied endorsement.** Employer name is shown **"as stated"**, with **no
   logo**, **no verified badge**, and no "TrueValue"/JobPosting structured data
   (the JSON-LD is suppressed for sourced listings).
6. **Attribution + link-out.** The source name and a link to the **original
   posting** are shown; we link out rather than republishing full copyrighted text.
7. **Freshness.** `last_seen` is displayed and a stale-sourced sweep runs in the
   expire cron; stale listings are demoted/expired.
8. **Claim-to-verify.** Any employer can claim their listing (`/claim/[id]`);
   claiming routes into founder review, then converts to a real verified listing
   (with a pre-conversion snapshot so a revoked claim fully reverts).

These make the product's *presentation* honest. The **legal exposure lives in
sourcing policy** — where we pull from and how much we reproduce — which is why
the founder, not the code, approves each source.

## 3. Source allowlist policy (the decision that matters)

**Only ingest from sources on the approved allowlist.** For each source, record in
`complianceStatus`/notes **why** it is permitted (the permission basis). Approve a
source only if it fits one of these bases:

| ✅ Permitted basis | Examples | Notes |
|---|---|---|
| **Government / public-sector job boards** | USAJOBS, state workforce boards | Public-record postings; generally free to reuse. |
| **Employer's own career/apply page** | A farm's or lodge's own "careers" page | Most authoritative source. Prefer pages that publish **schema.org `JobPosting` JSON-LD** (published specifically to be aggregated — the same data Google for Jobs consumes). Respect `robots.txt`. |
| **Open / Creative-Commons or explicitly-syndicated feeds** | CC-licensed datasets, employer RSS/XML job feeds | Confirm the license/feed terms permit republication of facts. |
| **Consented partners** | A staffing partner or job board that has agreed in writing | Keep the written permission on file. |

**Do NOT approve** (high risk — do not ingest without counsel sign-off):

- **ToS-protected aggregators** (Indeed, LinkedIn, ZipRecruiter, Glassdoor, etc.).
  Scraping sites whose Terms prohibit it invites CFAA / breach-of-contract /
  trespass-to-chattels exposure. Avoid.
- Any source that requires login/paywall to access.
- Any source whose terms are unclear — leave it `pending_review`.

## 4. Per-risk operating rules

1. **Scraping / Terms of Service (the big one).** Only the allowlisted bases in §3.
   No scraping of ToS-protected sites. Honor `robots.txt`. Rate-limit politely.
2. **Copyright.** Job *descriptions* can be copyrightable prose; **facts are not**.
   Extract only stated facts and **link to the original** — never republish the
   full description verbatim. (The engine's stated-only extraction already does
   this; do not add a "full description" field for sourced listings.)
3. **Trademark / false endorsement.** Name the employer **as stated** (nominative
   fair use). **No logos.** Keep the "not confirmed / not affiliated" disclosure on
   every sourced surface. Never imply partnership or endorsement.
4. **Accuracy / defamation / false-light.** Show `last_seen`, keep the "not
   confirmed" framing, run the stale sweep, and honor takedown/correction requests
   **fast** (§5). Never present a filled or expired role as open.
5. **Personal data / privacy.** Prefer company-level info. Do not ingest a named
   individual's personal contact details from a posting; keep it to the org and the
   role.

## 5. Takedown & correction process

- Provide a clear contact (e.g. `legal@` / a form) for employers to request
  **removal or correction** of a sourced listing about them.
- On a valid request: expire/remove the listing promptly (target: **≤ 72 hours**),
  and add the source/employer to a suppression list so it is not re-ingested.
- Log every request and its resolution.
- The **claim flow** is the positive path: an employer who wants the listing can
  claim + verify it instead of removing it.

## 6. Disclosure & attribution requirements (must stay on)

Every sourced listing surface must show, at minimum:
- The **"Sourced · not confirmed"** disclosure band.
- **Source name** + link to the **original posting**.
- **Employer "as stated"**, no logo, no verified badge.
- **"Not stated"** for any benefit the posting didn't specify.

A public **"About sourced listings"** page (plain-language explanation of the above)
and the takedown contact should be linked from the disclosure band before go-live.

## 7. Go-live checklist

- [ ] Counsel has reviewed this policy, the source allowlist, and the disclosure copy.
- [ ] The initial allowlist contains **only** clearly-permitted sources (§3), each
      with its permission basis recorded in `complianceStatus`/notes.
- [ ] "About sourced listings" page + takedown contact are live and linked.
- [ ] Takedown workflow + suppression list are in place and tested.
- [ ] Sourced volume is bounded to the "initial attraction" layer, not the bulk of
      inventory; the claim→verify path is prominent so sourced converts to owned.
- [ ] `robots.txt` is respected by the ingestion pipeline for every source.

## 8. Bottom line

The engine is built to be honest and defensible; the residual risk is a **sourcing
and policy** decision, not a code decision. Start with a **tiny allowlist of clearly-
permitted sources**, facts-only with link-out, full disclosure on every card, a fast
takedown path — and **have counsel bless the source list and disclosure copy before
launch.** Treat sourced inventory as the thin bootstrap layer it is, and lean on
claim→verify to turn it into real host-owned listings quickly.
