# Canon Access — Live Notion Journal for Coding Agents

**Canon = the Notion journal "Explore&Earn Source of Truth — Master Index" and everything under it.**
Notion is the source of truth. This repo *builds* against canon; it does not redefine it.

## How agents read canon (live)

Coding agents (VS Code Copilot agent mode, Claude Code) connect to the **official Notion MCP
server** and read the journal directly — live, with every founder/Teach edit visible immediately.

Config ships in the repo so the connection is automatic:

- `.vscode/mcp.json` — VS Code (Copilot agent mode, MCP-aware extensions)
- `.mcp.json` — Claude Code (project-scoped MCP)

Both point at `https://mcp.notion.com/mcp`.

### First-run auth (one time, per machine/agent)

1. Open the project in VS Code (or start Claude Code in the repo root).
2. When the `notion` MCP server starts, approve the **OAuth sign-in** prompt and authenticate
   with the Notion account that can see the Explore&Earn workspace.
3. The agent now has live read access to the entire journal. No token is stored in the repo.

> Authenticate as an account with access to the Explore&Earn workspace so the full Master Index
> is visible. Access is read-oriented; agents must not mutate canon — canon changes go through
> Teach/Notion, then land in the repo as build artifacts.

## Entry points

- **Start here:** search the workspace for "Explore&Earn Source of Truth — Master Index" and read down the tree.
- Key locked decisions also have a committed mirror for offline/CI use:
  `docs/architecture/stack-and-providers.md` (locked stack + secrets manager).

## Why live MCP instead of a committed copy

A static `docs/canon/` export always lags the journal. Live MCP means agents see founder/Teach
edits the moment they happen — maximum freshness and full coverage. The committed mirror under
`docs/architecture/` is kept only for the few decisions CI must grade deterministically.
