# GitHub → Notion Sync Worker

Second automation in the Explore&Earn agent relay. Mirrors every **issue** and
**pull request** from `AutomatedEmpires/explore-and-earn` into a managed Notion
database, refreshed on a schedule.

Mantra (`AGENTS.md`): **Notion decides. GitHub builds.** This worker gives Notion
(and Notion AI) visibility into GitHub state — **one direction only**. It never
writes to GitHub, so it can't corrupt implementation truth. The reverse
(Notion → GitHub) is the separate `notion-github-issue-dispatcher` worker.

## What it does

- Declares one managed Notion database, `Explore&Earn — GitHub`, keyed on the
  GitHub `node_id` (unique across issues and PRs).
- `worker.sync("githubSync", { mode: "replace", schedule: "30m" })` re-fetches
  all issues and PRs every 30 minutes. `replace` mode prunes anything not seen
  in a cycle, so closed/deleted items fall out automatically.
- Two phases per cycle: issues first (PRs are filtered out of the issues
  endpoint), then pulls (needed to tell **Merged** apart from **Closed**).

## Database schema

| Property | Type | Source |
| --- | --- | --- |
| Title | Title | `#<number> <title>` |
| Node ID | Text (primary key) | GitHub `node_id` |
| Number | Number | issue / PR number |
| Type | Select | Pull Request / Issue |
| State | Select | Open / Closed / Merged |
| Author | Text | `user.login` |
| Labels | Text | comma-joined label names |
| Branch | Text | PR head ref (PRs only) |
| URL | URL | `html_url` |
| Created / Updated | Date | `created_at` / `updated_at` |

Properties defined in code are worker-controlled; you can add extra properties
in Notion and those stay editable.

## Configuration

Set via `ntn workers env set KEY=value` (or a local `.env`, see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | PAT with **repo: read** (fine-grained, scoped to the one repo is ideal). |
| `GITHUB_OWNER` | no | Defaults to `AutomatedEmpires`. |
| `GITHUB_REPO` | no | Defaults to `explore-and-earn`. |

## Develop / deploy

```bash
pnpm --filter @explore-and-earn/github-notion-sync check   # tsc --noEmit
ntn doctor                                                 # validate the worker
ntn workers sync trigger githubSync --preview              # dry run, writes nothing
ntn workers deploy                                         # creates the managed DB
ntn workers sync trigger githubSync                        # first real sync
```

> ⚠️ Deploying Notion Workers requires a **Business plan or above**. The CLI and
> local testing work on any plan; hosted deploy does not.

## Repo-fit notes

- Verified against the Notion Workers SDK reference (`worker.database`,
  `worker.sync`, `Schema.*`, `Builder.*`).
- Like the dispatcher, this package is intentionally **not** in the root
  `tsconfig.json` project references; root `typecheck` is `tsc -b`. It
  type-checks standalone via its own `check` script, and `build` is
  `tsc --noEmit` so it emits nothing into the repo. `ntn` bundles the source at
  deploy time.
- v1 keeps only verified SDK surface. Candidate upgrades, once validated with
  `ntn doctor`: a `worker.pacer` rate-limiter, writing each issue/PR body into
  the row's page content, per-row emoji icons, and `mode: "incremental"` with a
  `since` cursor for larger histories.
