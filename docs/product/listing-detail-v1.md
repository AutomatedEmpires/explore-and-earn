# Listing Detail V1 — Product Spec

> Product rules for the full opportunity view. Visual spec: [`../design/listing-detail-v1.md`](../design/listing-detail-v1.md).

## Role

The Listing Detail is the **decision surface**: it gives a seeker everything needed to apply with confidence. It expands the card without changing the visual language.

## Must answer, in depth

- **Housing** — what/where I'll sleep, with a photo bucket (evidence).
- **Meals** — what I'll eat, with a photo bucket (evidence).
- **Pay** — what I'll earn, and how pay is structured.
- **The role** — responsibilities, schedule, requirements, duration (begins/ends).
- **The host** — who they are + trust signals + link to full profile.
- **Location** — where, respecting any location-privacy rules in canon.
- **Trust** — Verified Host (self-declared) explainer.

## Rules

- Reuses the card's tokens, icons, photo language, and triad — no new visual system.
- **Quick Apply** is always reachable (sticky on mobile, side rail on desktop).
- Housing/Meals evidence photos are **framed, never filtered or altered** (trust).
- Verified Host badge + "Self-Declared by Host" qualifier present.
- Apply disabled (with clear reason) when closed/filled.

## States

loading · default · saved · applied · closed/filled · boosted · matched · under-review (admin) · error/empty.

## Out of scope for V1 spec

The actual apply submission pipeline, messaging, and scheduling are separate canon specs; this doc defines the **view + decision** surface, not the application backend.
