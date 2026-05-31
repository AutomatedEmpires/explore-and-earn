# CLAUDE.md

This repository's agent instructions live in **[`AGENTS.md`](./AGENTS.md)**. Read it in full before acting.

@AGENTS.md

## Claude-only notes

- You are an *interchangeable implementer* at the single "engineer" station. One agent owns one task on one branch at a time — never edit files another engine is actively working.
- On a 16 GB ARM laptop, prefer running **one agent at a time** to avoid resource pressure.
- Everything else (build order, forbidden actions, design rules, handoff protocol) is in `AGENTS.md`. Do not duplicate rules here — keep this file thin so there is one source of truth.
