# Notion -> GitHub Dispatcher Worker

First Explore&Earn Notion worker scaffold. This package now hosts both the manual dispatcher tool and a live dispatch loop described in `docs/agents/handoff-protocol.md`: watch a Notion data source for ready engineering tasks, open GitHub issues from the repo handoff template, and write the result back into Notion.

## What it ships

- A Notion worker entrypoint at `src/index.ts`
- One write tool: `dispatchReadyTaskToGitHub`
- A scheduled sync: `watchReadyTasks`
- A scheduled sync: `reconcileGitHubArtifacts`
- A managed Notion database that records the latest dispatch outcome for each source page
- A managed Notion database that records the latest GitHub reconciliation outcome for each source page
- A dry-run mode so the issue payload can be inspected before GitHub is called
- A rollout-risk artifact at `ROLLOUT-RISKS.md`

## Live pipeline behavior

`watchReadyTasks` runs every minute.

On each run it:

- Queries a configured Notion data source for pages whose status is `Ready for Engineering`
- Uses persisted sync state keyed by Notion source page ID as the primary duplicate guard
- Searches GitHub for an existing issue tagged with the source page ID only when no prior dispatch record exists yet
- Creates a new GitHub issue when no existing one is found
- Writes the issue URL, issue number, dispatch timestamp, and any error text back into the source Notion page when matching properties exist
- Upserts a durable status row into the worker-managed `Notion Dispatch Runs` database

`reconcileGitHubArtifacts` also runs every minute.

On each run it:

- Queries the same Notion data source for pages that already have a tracked GitHub issue URL or number
- Reads the linked GitHub issue and any pull request cross-referenced from the issue timeline
- Maps repo state back onto Notion lifecycle state: `ready-for-engineering`, `in-progress`, `in-review`, `changes-requested`, and `done`
- Writes PR URL, PR number, GitHub sync timestamp, and reconcile errors back into the source Notion page when matching properties exist
- Upserts a durable status row into the worker-managed `GitHub Artifact Reconciliations` database

## Required worker secrets

Set these before deploying or executing the live tool:

```bash
ntn workers env set \
  NOTION_API_TOKEN=ntn_... \
  NOTION_READY_TASKS_DATA_SOURCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  GITHUB_TOKEN=your-token \
  GITHUB_OWNER=AutomatedEmpires \
  GITHUB_REPO=explore-and-earn
```

`NOTION_API_TOKEN` must be able to read and update the target Notion data source. `GITHUB_TOKEN` must be allowed to search issues and create issues in the target repository.

## Expected Notion source properties

By default the live pipeline looks for these source-side properties:

- `Name`
- `Status`
- `Goal`
- `Scope (in)`
- `Out of scope / forbidden`
- `Acceptance Criteria`
- `Labels`
- `Founder approval gate`
- `GitHub Issue URL`
- `GitHub Issue Number`
- `GitHub PR URL`
- `GitHub PR Number`
- `Last Dispatch At`
- `Dispatch Error`
- `Last GitHub Sync At`
- `GitHub Sync Error`

Only `Name`, `Status`, and `Goal` are effectively required for successful issue creation. The write-back properties are optional; when they do not exist, the worker still dispatches and records the result in its managed run database.

You can rename any of these with worker env vars such as `NOTION_GOAL_PROPERTY`, `NOTION_ISSUE_URL_PROPERTY`, `NOTION_LABELS_PROPERTY`, or `NOTION_STATUS_PROPERTY`.

## Optional worker secrets

These tune the live loop without changing code:

```bash
ntn workers env set \
  NOTION_READY_STATUS_VALUE="Ready for Engineering" \
  NOTION_IN_PROGRESS_STATUS_VALUE="In Progress" \
  NOTION_IN_REVIEW_STATUS_VALUE="In Review" \
  NOTION_CHANGES_REQUESTED_STATUS_VALUE="Changes Requested" \
  NOTION_DONE_STATUS_VALUE="Done" \
  NOTION_DISPATCHED_STATUS_VALUE="Dispatched" \
  NOTION_READY_LABEL="ready-for-engineering" \
  NOTION_BLOCKED_LABEL="status:blocked" \
  NOTION_DEFAULT_LABELS="agent:copilot" \
  NOTION_PAGE_SIZE=20
```

When a founder gate is present, the dispatcher removes the ready label, adds `status:blocked`, and adds the matching `gate:*` label when it can map the gate text to repo canon.

## Local validation

```bash
pnpm --filter @explore-and-earn/notion-github-dispatcher typecheck
```

## Deploy

```bash
cd tools/notion-github-dispatcher
ntn workers deploy --name explore-and-earn-dispatcher
```

If `workers.json` already exists for this package, `ntn workers deploy` updates the existing worker instead of creating a new one.

After deploy, the sync starts on its schedule automatically. You can also manage it directly:

```bash
ntn workers sync status watchReadyTasks
ntn workers sync trigger watchReadyTasks
ntn workers sync state reset watchReadyTasks
ntn workers sync status reconcileGitHubArtifacts
ntn workers sync trigger reconcileGitHubArtifacts
ntn workers sync state reset reconcileGitHubArtifacts
```

## Example execution

```bash
ntn workers exec dispatchReadyTaskToGitHub -d '{
  "title": "Build seeker dashboard shell",
  "sourceUrl": "https://app.notion.com/p/Seeker-Dashboard-Product-Specification-Adventure-Application-Command-Center-36edeb0aed5a8175a989c028df57bd62",
  "goal": "Ship the first seeker dashboard shell behind the existing app structure.",
  "sourcePageId": "36edeb0aed5a8175a989c028df57bd62",
  "owner": null,
  "repo": null,
  "scopeIn": ["Route shell", "placeholder loading states"],
  "outOfScope": ["real analytics", "production notifications"],
  "acceptanceCriteria": ["Route exists", "PR links the source page"],
  "founderApprovalGate": "none",
  "labels": ["agent:copilot"],
  "dryRun": true
}'
```

Pass `null` for `owner`, `repo`, or `founderApprovalGate` when you want the worker to fall back to secrets or default text. Pass `[]` or `null` for optional list fields when there is nothing to include.

Drop `"dryRun": true` once the payload looks right and the worker has a valid `GITHUB_TOKEN` secret.