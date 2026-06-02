# UI Fixtures (lead-owned foundation)

Display-only view-models + mock data so every feature lane renders against **one
canonical shape** for the Discovery Card, Listing Detail, and Host Profile
surfaces. Founder-approved 2026-06-02.

## Rules

- **Read-only for feature lanes.** Import from `@/lib/fixtures` (or relative
  path); do not fork or redefine these shapes per lane.
- **Not a data model.** These are presentation view-models with human-readable
  display strings only — no persistence, DB schema, money math, or routing. The
  real object model stays gated in the data-dictionary build pack
  (`packages/contracts/src/card.ts`).
- **Mirrors canon.** Types compose `@explore-and-earn/contracts`
  (`OpportunityTriad`, `BenefitTriad`, `OpportunityCategory`, conditional
  badges, the Verified-Host qualifier) via type-only imports.
- **Taxonomy is locked:** `farm · maritime · remote · seasonal · mix`. Lodge is
  a Seasonal setting, never its own category.
- Changes to these files go through the lead (foundation owner).
