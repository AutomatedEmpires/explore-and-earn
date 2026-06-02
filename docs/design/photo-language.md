# Photo Language

> Source of truth: Notion *Design Tokens & Visual System — V1* (photography treatment, locked). Rule of thumb: **frame, not filter.**

## The locked rule

Apply the hand-drawn **frame + paper mat AROUND** untouched host photos. **Do NOT apply texture/filter overlays ONTO user photographs.**

Why:

- Preserves image integrity + trust. Housing / meals / verification-evidence photos **must never be altered**.
- The painterly feel comes from the **frame + chrome + icons + type** — not from mutating photos.
- Cheap to implement (CSS/SVG frame); avoids per-image canvas processing.

## Specs

- **Hero crop ratio:** `3:2`, `object-fit: cover`. The paper mat absorbs letterboxing.
- **Image radius:** `16` (token).
- **Frame:** hand-drawn ink border (`--border-ink`) on a paper mat (`--color-surface` / `--color-surface-raised`). Borders-first — no heavy drop shadows on media.
- **Fallback:** when no photo is present, render a **category fallback illustration** tinted to the category accent.

## Photography direction (warm, organic, real)

Use warm, organic, lifestyle photography that reads as a real working landscape. Balance imagery across the visual lanes — do not default everything to alpine adventure:

- **Farm / Orchard / Greenhouse** — warm earth, produce, soil, barns, golden-hour light, wood, baskets, greenhouses.
- **Maritime** — rope, docks, water, boats, nets, salt.
- **Remote** — cabins, laptops, quiet landscapes, desks, simple workspaces.
- **Seasonal / Outdoor** — mountains, cabins, lodges, trails, lakes, pine, stone, scenic work (lodge is a setting under seasonal, not a category).
- **Mix** — blended, multi-category compositions (e.g., produce + water, cabin + dock); balance two or more lanes with cohesive warm/natural light so the image reads intentionally blended, not accidental. Mix inherits the dominant lane's cues rather than inventing its own palette.

## Rejected for V1

- A global watercolor / filter overlay on listing photos.
- Any pipeline that bakes effects into the stored image.
- Stock-looking corporate office photography.

## Trust note

Housing, meals, and verification photos are **evidence**. They feed the Verified Host (self-declared) trust model and the housing/meals detail buckets. Altering them would undermine trust — never do it.
