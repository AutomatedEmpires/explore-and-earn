# Match Score Model V1

> DRAFT — architecture only. Canonical values cited from "Exact Ranking, Matching & Boost Formula" and "Matching Pipeline / Scoring / Refresh". Unlocked values marked TODO(?).

## Purpose

The match score is an **assistive relevance estimate** between a seeker profile and a live listing. It helps seekers find lifestyle-fit opportunities and helps hosts review relevant candidates faster. It is **not** a prediction of job success, a quality ranking of people, or a hiring decision.

## Scale

- `score`: integer **0–100** (canon: Exact Ranking & Matching Formula).
- `confidence`: integer **0–100**, a separate axis describing how much data backs the score (canon).
- `band`: a categorical label derived from score. Host-facing display uses the **band**, not raw internal subscores (guardrail G11). Canonical band thresholds and labels are **TODO(?)** — proposed bands `strong` / `developing` / `needs_attention` mirror G11's host-visible categorical labels ("Strong" / "Developing" / "Needs attention"); exact numeric cutoffs require founder approval.

## Component weights (canon — do NOT alter without ADR)

Raw score is composed from (Exact Ranking & Matching Formula):

| Component | Weight |
| --- | --- |
| Timeline / availability fit | 20 |
| Skills / certifications fit | 20 |
| Role / category fit | 15 |
| Housing / meals / pay preference fit | 15 (housing 5, meals 3, pay 7) |
| Location / travel fit | 10 |
| Seeker goals / open-to fit | 10 |
| Completeness confidence | 5 |
| Behavioral reliability | 5 |

## Hard modifiers (caps applied AFTER raw score) — canon

| Condition | Effect |
| --- | --- |
| Required certification missing | cap score at 60 |
| Impossible timeline conflict | cap at 50 |
| Seeker requires housing but not included | cap at 65 |
| Visa support required but unavailable | cap at 50 |
| Trust / moderation concern | cap or hide |

**Exclusions (not scored at all):** listing not live; seeker blocked/restricted; host/account banned/suspended; listing closed/archived.

## Confidence components (canon)

| Component | Weight |
| --- | --- |
| Seeker resume completion | 25 |
| Listing completion | 25 |
| Relevance extension | 15 |
| Structured skills/certs/tags | 15 |
| Host profile / trust media | 10 |
| Recency / activity | 10 |

## Display format

- Host-facing: categorical band + score, always paired with an explanation entry point (guardrail: no score display without explanation contract). Example layout (copy not locked — TODO(?)): `Match 82% · Strong fit · Review why`.
- Seeker-facing: optional score or a "why this fits" summary. Exact seeker-visible wording is a **founder approval gate**.
- **No false precision**: never present sub-percent precision or claims like "97% perfect match". The score is heuristic and must be described as such.

## When the score appears / is hidden

- Appears: on relevant cards and in host candidate review when a `MatchResult` exists and the listing is live.
- Hidden: when excluded (see exclusions), when confidence is below a **TODO(?)** display threshold (founder gate), or when a trust/moderation concern triggers hide.

## Storage, staleness, recompute (canon: Matching Pipeline / Scoring / Refresh)

- **Stored**, not computed on read. `MatchResult` core fields: `seekerProfileId`, `listingId`, `score`, `confidence`, `reasons`, `generatedAt`, `staleAt`, `version`.
- Refresh is **hybrid**: immediate recompute for high-impact changes, queued bulk recompute, and scheduled stale refresh. Stale results (`now > staleAt`) are flagged and refreshed; display rules for stale-but-shown results are **TODO(?)**.
- Candidate pools are built by category / timeline / location / preferences / eligibility / boosted membership (canon). Boosted membership affects pool/placement, never score (G8).

## What the score must NOT claim

- Must not claim to predict hiring success or job performance.
- Must not imply a guarantee or a hiring decision.
- Must not encode or be affected by monetization (G8) or protected/sensitive attributes (see `prohibited-signals-v1.md`).
