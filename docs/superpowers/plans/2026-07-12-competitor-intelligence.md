# Explore&Earn Competitor Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend draft PR #247 with a source-cited competitor market map, differentiated category strategy, safe discovery playbooks, and upgraded founding-host outreach.

**Architecture:** A normalized CSV is the evidence layer; market intelligence and the positioning matrix summarize it; differentiation, search, acquisition, and pitch documents convert the findings into operator actions. Existing prospect data remains authoritative and unchanged unless validation proves a specific defect.

**Tech Stack:** Markdown, RFC 4180-compatible CSV, PowerShell structured validation, pnpm monorepo checks, GitHub draft PR workflow.

## Global Constraints

- Do not scrape or republish job listings, descriptions, employer photos, pay, housing, meals, or logged-in data.
- Do not bypass robots.txt, technical controls, or platform logins.
- Competitor content is research and search-term intelligence only; a discovered employer enters the lead pipeline only after official-site verification.
- Do not imply a prospect is partnered with Explore&Earn without agreement.
- Do not fabricate contact information or unsupported competitor claims.
- Commercial email stays blocked until a valid physical postal address and live suppression process are approved; do not cold-SMS public numbers.
- Keep Explore&Earn focused on Farm, Maritime, Remote, and Seasonal with seeker-free discovery through Seek, Swipe, and Map and explicit Housing, Meals, and Pay.
- Update existing draft PR #247; do not create another PR.

---

### Task 1: Primary-source competitor evidence

**Files:**
- Create: `data/growth/explore-and-earn/competitor_market_map.csv`

**Interfaces:**
- Consumes: public, no-login official platform pages.
- Produces: one normalized row per researched platform with all 22 requested fields and one or more evidence URLs.

- [ ] Research the required seasonal, agricultural, maritime, remote, general, and direct-discovery platform groups using official public pages.
- [ ] Record observed product facts, explicit unknowns, strengths, gaps, and Explore&Earn implications in original language.
- [ ] Create the CSV with the exact requested column order, `2026-07-12` access dates, and 0–100 evidence-confidence scores.
- [ ] Validate row widths, URLs, required fields, dates, score ranges, and unique platform names.

### Task 2: Competitor synthesis and positioning

**Files:**
- Create: `ops/growth/explore-and-earn/COMPETITOR_INTELLIGENCE.md`
- Create: `ops/growth/explore-and-earn/COMPETITOR_POSITIONING_MATRIX.md`
- Create: `ops/growth/explore-and-earn/EXPLORE_AND_EARN_DIFFERENTIATION.md`

**Interfaces:**
- Consumes: Task 1 market-map records and evidence URLs.
- Produces: platform comparisons, category leaders, non-head-on warnings, and an evidence-bounded differentiation system.

- [ ] Write the intelligence report with methodology, feature definitions, category findings, and required comparison sections.
- [ ] Build the compact matrix with Platform, Category, Strength, Gap, Explore&Earn response, Evidence URL, and Confidence.
- [ ] Write `Why Explore&Earn is different` using comparative, non-disparaging language and clear limits on claims.
- [ ] Cross-check every factual platform statement against an evidence URL and label inferences.

### Task 3: Safe category search expansion

**Files:**
- Create: `ops/growth/explore-and-earn/CATEGORY_SEARCH_PLAYBOOK.md`
- Create: `ops/growth/explore-and-earn/SEARCH_QUERY_BANK.md`

**Interfaces:**
- Consumes: the platform taxonomy and legal rules from Tasks 1–2.
- Produces: Farm, Maritime, Remote, and Seasonal search workflows that terminate at official employer verification.

- [ ] Define per-category platforms, query patterns, official-source follow-up, exclusions, qualification, copying prohibitions, and pre-outreach verification.
- [ ] Add reusable general, category, and platform-specific query banks for every platform named in the continuation brief.
- [ ] Add a discovery-to-CRM decision gate that rejects directory-only claims and third-party listing details.
- [ ] Confirm the playbook never authorizes scraping, copying, login access, guessed contacts, or cold SMS.

### Task 4: Acquisition and pitch upgrade

**Files:**
- Create: `ops/growth/explore-and-earn/HOST_ACQUISITION_COMPETITOR_GAP_STRATEGY.md`
- Create: `ops/growth/explore-and-earn/FOUNDER_HOST_PITCH_V2.md`
- Modify: `ops/growth/explore-and-earn/HOST_ACQUISITION_PLAN.md`
- Modify: `ops/growth/explore-and-earn/FOUNDING_HOST_OFFER.md`
- Modify: `ops/growth/explore-and-earn/HOST_OUTREACH_EMAILS.md`
- Modify: `ops/growth/explore-and-earn/HOST_CALL_SCRIPT.md`
- Modify: `ops/growth/explore-and-earn/HOST_PRODUCT_FEEDBACK_LOOP.md`

**Interfaces:**
- Consumes: category gaps and positioning from Task 2.
- Produces: a revised first-30 contact strategy, accurate host pitch, discovery questions, and competitor-attribution feedback capture.

- [ ] Segment the existing first 30 by category and competitor context without changing their high-priority status.
- [ ] Explain how competitor findings change personalization, call discovery, and pilot learning priorities.
- [ ] Update host-facing copy around host control, practical clarity, evidence photos, applicant expectations, complementary channels, and no copied inventory.
- [ ] Preserve pricing canon, Verified Host hold, postal-address block, suppression gate, and permissioned-SMS rule.

### Task 5: Integrated verification and PR update

**Files:**
- Validate: all new and modified files in Tasks 1–4.
- Update: draft PR #247 body and branch commits.

**Interfaces:**
- Consumes: the complete branch diff.
- Produces: verified, reviewed, pushed PR changes with no duplicate PR.

- [ ] Validate both CSV files and prove the original prospect totals remain 100 / 30 / 10 / 3.
- [ ] Run Markdown link, copied-content risk, and secret scans available in the repo or with safe local checks.
- [ ] Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test` and record exact results.
- [ ] Request an independent whole-branch review and fix every Critical or Important finding.
- [ ] Inspect the intended diff, commit only scoped files, push the current branch, and update draft PR #247 without opening another PR.
