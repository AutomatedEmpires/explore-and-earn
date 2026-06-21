# MCP & Tooling Proposal — Design Agent

> **Status:** Proposal. **Nothing here is installed or changed without your explicit approval.** No untrusted repos/packages are auto-installed. Items that execute remote code, require credentials, or change global config are flagged **[APPROVAL REQUIRED]** and will wait.
>
> **Headline:** the design agent's core need — *render my own UI and critique it* — is already satisfied by MCP servers connected in this session. Recommended new installs are minimal.

## What's already connected (use now — no action needed)

| Tool | Status | What it does for design | Secrets | Risk |
|---|---|---|---|---|
| **Playwright MCP** (`plugin:playwright`) | ✅ Connected | Drive a real browser: navigate a route, resize to 380/1024, screenshot, toggle reduced-motion, read the a11y tree. This is the self-critique loop. | none (local browser) | Low — local, sandboxed browser |
| **chrome-devtools MCP** | ✅ Connected | Deeper inspection: Lighthouse/CWV, performance traces, console/network, device emulation. For perf + a11y dimensions of the scorecard. | none | Low — local |
| **Figma MCP** (claude.ai Figma) | ✅ Connected | Pull design context, variables, screenshots from Figma *if you create/import references there*; can also push code→Figma. | Figma OAuth (already authed) | Low–med — only reads/writes Figma files you point it at |
| **`gh` CLI** | ✅ Working | Repo/issue/PR coordination (already used this session). Covers the "GitHub MCP" need without a server. | gh auth (already set) | Low |

**Implication:** I can already, today, screenshot any Explore&Earn route at mobile + desktop, with reduced-motion, and score the rendered pixels. The `visual-upgrade` / `design-audit` / `motion-system-review` skills assume exactly this.

## Recommended additions

### A. Local multi-viewport screenshot script — **recommended, SAFE**
A small repo script (`tools/scripts/shoot.mjs`) that drives Playwright to capture a route at 380px + 1024px + reduced-motion in one command, into `docs/design/reference/_shots/` (gitignored). Convenience wrapper over the already-connected Playwright.
- **Why:** repeatable, consistent before/after captures for the scorecard; no manual MCP steps each time.
- **Secrets:** none. **Risk:** low — local code, runs `pnpm dev` + a headless browser. **Remote code:** none.
- **Setup (only if you approve me adding it):**
  ```bash
  # browsers are fetched by Playwright on first run (~150MB, one-time)
  pnpm dlx playwright install chromium
  node tools/scripts/shoot.mjs /seek           # → mobile + desktop + reduced-motion PNGs
  ```
- **Status:** I'll add the script + `.gitignore` entry on your go-ahead. (Creating the file is harmless; first run downloads a Chromium build.)

### B. Local inspiration/reference folder — **recommended, SAFE**
`docs/design/reference/` already exists. Use it as a drop zone: you (or I) save *reference screenshots* (Patagonia, Airbnb, Nat Geo, premium marketplaces) and short notes; I compare new surfaces against them. **Principles, never copied code/assets.**
- **Secrets:** none. **Risk:** none. Don't commit copyrighted images to the public repo — keep them in a gitignored `reference/_external/` and reference by description.

### C. Post-edit check/format hook — **[APPROVAL REQUIRED]** (changes harness config)
A Claude Code hook in `.claude/settings.json` that runs `pnpm lint`/format after edits so style/drift never piles up.
- **Why:** enforces tokens-only + lint automatically; catches raw-hex drift early.
- **Secrets:** none. **Risk:** low, but it **modifies harness config and runs commands on every edit** → approval required. **Remote code:** none.
- I'll propose the exact `settings.json` block for your review before writing it.

### D. Motion library (`motion`, the React-19 successor to Framer Motion) — **[APPROVAL REQUIRED]** (dependency add)
Not an MCP — a product dependency. Today motion is CSS-only (fine for ~90% of cases). A library helps *only* when we need real gesture tracking, shared-element transitions, or spring physics beyond CSS.
- **Why it could help:** swipe/drag (`/swipe`), draggable map sheets, orchestrated reveals.
- **Why defer:** it's a bundle + dependency cost, and our locked motion is deliberately no-overshoot (CSS covers it). Add only when a specific surface proves CSS insufficient.
- **Secrets:** none. **Risk:** low/reversible, but it's a **dependency change** → approval required, and adds bundle weight.
- **If approved, for a specific surface:**
  ```bash
  pnpm --filter @explore-and-earn/web add motion   # React 19 compatible
  ```
- **Recommendation:** **defer** until a surface (likely the swipe deck or map sheet) actually needs it; revisit then.

## Explicitly NOT recommended
- ❌ Auto-installing third-party "design system" repos or unvetted npm packages (per your instruction and the security posture). We compose our own locked system.
- ❌ Any MCP server requiring new credentials we don't already hold, without a clear, surface-specific need.
- ❌ "Fixing" the failed-to-connect GitHub MCP — `gh` CLI already covers it.

## Approval summary

| Item | Action | Needs approval? |
|---|---|---|
| Playwright / chrome-devtools / Figma MCP, `gh` | Use now | No (already connected) |
| A. Screenshot script | I add `shoot.mjs` + gitignore | Light — just say "add it" |
| B. Reference folder workflow | Use `docs/design/reference/` | No |
| C. Post-edit lint hook | Edit `.claude/settings.json` | **Yes** (config change) |
| D. `motion` library | `pnpm add motion` | **Yes** (dependency) — and defer |

Tell me which of A–D you want; I'll act only on those.
