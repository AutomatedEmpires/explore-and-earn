# Host Candidate Review V1

> DRAFT — architecture only, no UI. Canonical from "Application & Host Review Pipelines", "Permission / Visibility / RLS Registry", "Host Dashboard Spec".

Goal: fast, ranked-but-explainable candidate review. Host stays responsible for selection — **no automatic final hiring decisions**.

## What the host sees

- Ranked applicant/candidate list (ordered by match score within eligible pool).
- Match band + score, paired with explanation entry point (G11; no score without explanation).
- Profile/resume popup (opened by clicking the candidate card body).
- Application status + viewed/saved/invited/offered/accepted/not-selected/expired states.
- Quick actions: save (`saved_by_host`), invite, offer, not select. ("Shortlist" terminology prohibited — use save.)
- Filters by fit/status.
- Trust / profile-completeness signals.
- Notes: **TODO(?)** — whether host notes ship in V1 needs founder confirmation.

## Matched Bucket Context visibility (Permission/Visibility/RLS Registry)

In matched-bucket context the host sees a **limited** seeker card: match score/confidence/reasons, desired categories/roles, **relative** location, availability summary, skills/tags. The host does **not** see full contact, raw resume, or private notes unless there is an application/invite context granting it. Server + RLS enforce; frontend locks are UX-only.

## Host team roles (canon)

`owner`, `admin`, `hiring_manager`, `analyst`, `billing`, `viewer`. Review/decision actions are role-scoped (enforced server-side + RLS).

## Decision velocity, not bloat

Design for rapid review with clear actions. Do **not** build enterprise-ATS bloat. Preserve clean navigation.

## Not implemented here

No UI, no ranking execution, no decision writes. Architecture only.
