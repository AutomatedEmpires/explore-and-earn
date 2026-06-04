# Notion → GitHub Issue Dispatcher

First automation in the Explore&Earn agent relay. Implements **step 2** of
[`docs/archive/claos/handoff-protocol.md`](../../docs/archive/claos/handoff-protocol.md):

> A dispatcher creates a GitHub issue: title, body, acceptance criteria, labels,
> agent type, priority, and a link back to the Notion source. The issue URL is
> written back into Notion.

Mantra (`AGENTS.md`): **Notion decides. GitHub builds.** This worker is the bridge.

## What it does

Exposes one Notion Worker tool, `dispatchTaskToGithub`, callable by the Notion
(Opus) Custom Agent. Given a Notion handoff it:

1. Builds a GitHub issue body using the handoff-protocol template verbatim
   (Source of truth / Goal / Scope (in) / Out of scope / Acceptance criteria /
   Founder approval gate).
2. Creates the issue via the GitHub REST API.
3. Writes the created issue URL back to the Notion source page.
4. Returns `{ issueUrl, issueNumber, title, labels, notionWriteBack }`.

Auto labels: `ready-for-engineering`, `source:notion`, plus `priority:<p>` and
`agent:<type>` when supplied, merged with any extra labels and de-duplicated.

This is a **write** tool (no `readOnlyHint`), so it prompts for confirmation
before creating an issue.

## Configuration

Set via `ntn workers env set KEY=value` (or a local `.env`, see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | Fine-grained PAT, **Issues: Read and write** on `AutomatedEmpires/explore-and-earn`. |
| `GITHUB_OWNER` | no | Defaults to `AutomatedEmpires`. |
| `GITHUB_REPO` | no | Defaults to `explore-and-earn`. |
| `NOTION_API_TOKEN` | local only | Set automatically by the platform when the tool runs inside the Custom Agent. Only needed for `ntn workers exec` / local testing. |

The write-back targets a Notion **URL property** named `GitHub Issue` by default;
override per-call with `issueUrlProperty`, or pass `notionPageId: null` to skip.

## Develop

```bash
pnpm --filter @explore-and-earn/notion-github-issue-dispatcher check   # tsc --noEmit
ntn doctor
ntn workers exec dispatchTaskToGithub -d '{ ... }' --local --dotenv
```

## Deploy

```bash
ntn workers deploy
```

> ⚠️ Deploying Notion Workers requires a **Business plan or above**. The tool is
> complete, but it cannot run in production until the workspace plan allows it.

## Repo-fit notes

- This package is intentionally **not** added to the root `tsconfig.json`
  project references. Root `typecheck` is `tsc -b` (composite build); a worker
  bundled by `ntn` should not be forced into that graph. It type-checks
  standalone via its own `check` script. (Other `tools/*` packages are likewise
  excluded.)
- `build` is `tsc --noEmit` so `turbo run build` stays green without emitting
  artifacts into the repo; `ntn` bundles the source at deploy time.
