# docs/database

Database V1 documentation for Explore&Earn (planning stage — **DO NOT IMPLEMENT** without founder approval).

The canonical, full Database V1 plan lives in **`docs/architecture/backend-build-pack-v1.md`** and in Notion ("Backend Architecture, Database & API V1 Build Pack"). Notion = product/data canon; this repo = implementation truth.

## What goes here (later, gated)

- `schema-v1.md` — table-by-table column reference (mirrors Notion Exact Data Dictionary, reconciled against the registries).
- `migrations.md` — ordered migration plan (001–014 + ADR-029/refund/founding inserts).
- `rls.md` + `rls-coverage.md` — Row Level Security policy plan and coverage report.
- `enums.md`, `lifecycles.md` — generated mirrors of the Notion registries.

## Hard rules

- No executed migrations, no live Supabase changes from planning docs.
- UUID PKs · snake_case_plural tables · timestamptz UTC · soft delete · status columns constrained to the Enum Registry.
- One canonical `listings` table — no per-category tables (G7).
- No `verified_status` column — attestation model only (ADR-029 / G3).
- No `accepted_role` entity (G6).
- Do not invent fields/enums/lifecycles. Unclear canon → `TODO(?)` + founder queue.
