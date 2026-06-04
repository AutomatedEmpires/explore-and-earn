# Contracts V1 — Pre-merge Verification Log

Date: 2026-06-04
Verifier: Teach (backend spine lane)

The Contracts V1 spine was cross-checked file-by-file against the locked Notion
canon before merge:

- `enums.ts`           ← Canonical Enum Registry
- `events.ts`          ← Canonical Event Registry
- `lifecycles.ts`      ← Lifecycle Registry (application 30d / invite 14d / offer 7d)
- `permissions.ts`     ← Permission/RLS Registry + Ratification Record DR-B5
                         (owner / admin / hiring_manager / analyst / billing / viewer)
- `pricing.ts`         ← Founder Locked Pricing (integer cents; founding seat cap 100)
- `retention.ts`       ← ADR-041 retention windows
- `matching-config.ts` ← ADR-040 (match-score weights sum to 100; bands ordered)
- `api.ts`             ← API Contract Registry (`{ ok, data, meta }` envelope)

Guardrails upheld: G1/G23 (integer cents), G8 (no monetization in match score),
G13 (contract-registry parity), G16 (lifecycle transitions). No DB touched; no
migrations; no RLS. Additive substrate only.
