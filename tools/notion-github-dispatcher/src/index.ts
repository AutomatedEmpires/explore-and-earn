import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
  type CapabilityContext,
  type Infer,
  j,
  Worker,
} from "@notionhq/workers";

type JsonRecord = Record<string, unknown>;
type NotionDatabaseProperty = JsonRecord & { type: string };
type DatabaseProperties = Record<string, NotionDatabaseProperty>;
type NotionPage = {
  id: string;
  last_edited_time?: string;
  properties: Record<string, unknown>;
  url: string;
};

type GitHubIssueRequest = {
  body: string;
  labels: string[];
  owner: string;
  repo: string;
  title: string;
  token: string;
};

type GitHubIssueResponse = {
  html_url: string;
  number: number;
};

type PipelinePropertyNames = {
  acceptanceCriteria: string;
  dispatchError: string;
  founderApprovalGate: string;
  goal: string;
  githubSyncError: string;
  issueNumber: string;
  issueUrl: string;
  lastGitHubSyncAt: string;
  labels: string;
  lastDispatchAt: string;
  outOfScope: string;
  pullRequestNumber: string;
  pullRequestUrl: string;
  scopeIn: string;
  status: string;
  title: string;
};

type PipelineConfig = {
  blockedStatusLabel: string;
  changesRequestedStatusValue: string;
  defaultLabels: string[];
  doneStatusValue: string;
  dispatchedStatusValue: string | null;
  githubToken: string;
  inProgressStatusValue: string;
  inReviewStatusValue: string;
  owner: string;
  pageSize: number;
  propertyNames: PipelinePropertyNames;
  readyDispatchLabel: string;
  readyStatusValue: string;
  repo: string;
  sourceDataSourceId: string;
};

type DispatchRunStatus = "created" | "error" | "linked" | "skipped";

type DispatchOutcome = {
  issueNumber: number | null;
  issueUrl: string | null;
  lastEditedTime: string | null;
  message: string;
  processedAt: string;
  sourcePageId: string;
  sourceUrl: string;
  status: DispatchRunStatus;
  title: string;
};

type DispatchSyncState = {
  cursor?: string;
  dispatched?: Record<string, DispatchStateEntry>;
};

type DispatchStateEntry = {
  issueNumber: number | null;
  issueUrl: string | null;
  lastEditedTime: string | null;
  status: DispatchRunStatus;
};

type ReconcileRunStatus =
  | "blocked"
  | "changes-requested"
  | "closed"
  | "done"
  | "error"
  | "in-progress"
  | "in-review"
  | "ready-for-engineering";

type ReconcileOutcome = {
  issueNumber: number | null;
  issueUpdatedAt: string | null;
  issueUrl: string | null;
  message: string;
  notionStatusValue: string | null;
  processedAt: string;
  pullRequestNumber: number | null;
  pullRequestUpdatedAt: string | null;
  pullRequestUrl: string | null;
  sourcePageId: string;
  sourceUrl: string;
  status: ReconcileRunStatus;
  title: string;
};

type ReconcileSyncState = {
  cursor?: string;
  reconciled?: Record<string, ReconcileStateEntry>;
};

type ReconcileStateEntry = {
  issueUpdatedAt: string | null;
  message: string;
  pullRequestUpdatedAt: string | null;
  status: ReconcileRunStatus;
};

type GitHubIssueDetail = GitHubIssueResponse & {
  assignees?: Array<{ login?: string }>;
  labels?: unknown;
  state?: string;
  state_reason?: string | null;
  updated_at?: string;
};

type GitHubPullRequestDetail = {
  draft?: boolean;
  html_url: string;
  merged_at?: string | null;
  number: number;
  state?: string;
  updated_at?: string;
};

type PageUpdateIntent =
  | { kind: "clear" }
  | { kind: "datetime"; value: string }
  | { kind: "number"; value: number }
  | { kind: "option"; value: string }
  | { kind: "text"; value: string };

const dispatcherToolSchema = j.object({
  title: j.string().describe("GitHub issue title."),
  sourcePageId: j
    .string()
    .nullable()
    .describe("Optional Notion page ID used for GitHub dedupe."),
  sourceUrl: j
    .string()
    .describe("Canonical Notion source-of-truth URL for the task."),
  goal: j.string().describe("One-sentence outcome."),
  scopeIn: j
    .array(j.string())
    .nullable()
    .describe("Explicit in-scope bullets, or null when none are supplied."),
  outOfScope: j
    .array(j.string())
    .nullable()
    .describe(
      "Explicit out-of-scope or forbidden bullets, or null when none are supplied.",
    ),
  acceptanceCriteria: j
    .array(j.string(), { minItems: 1 })
    .describe("Checkbox-ready acceptance criteria."),
  founderApprovalGate: j
    .string()
    .nullable()
    .describe("Founder approval gate name, or null to default to none."),
  labels: j
    .array(j.string())
    .nullable()
    .describe("Optional GitHub labels. Labels must already exist in the repo."),
  owner: j
    .string()
    .nullable()
    .describe("Optional GitHub owner override. Null falls back to GITHUB_OWNER."),
  repo: j
    .string()
    .nullable()
    .describe("Optional GitHub repository override. Null falls back to GITHUB_REPO."),
  dryRun: j
    .boolean()
    .describe("When true, return the issue payload without calling GitHub."),
});

const dispatcherToolOutputSchema = j.object({
  dryRun: j.boolean(),
  owner: j.string(),
  repo: j.string(),
  title: j.string(),
  labels: j.array(j.string()),
  body: j.string(),
  issueNumber: j.number().nullable(),
  issueUrl: j.string().nullable(),
});

type DispatcherInput = Infer<typeof dispatcherToolSchema>;
type DispatcherOutput = Infer<typeof dispatcherToolOutputSchema>;

const worker = new Worker();

const githubSearchApi = worker.pacer("githubSearchApi", {
  allowedRequests: 10,
  intervalMs: 60_000,
});

const githubReadApi = worker.pacer("githubReadApi", {
  allowedRequests: 60,
  intervalMs: 60_000,
});

const githubWriteApi = worker.pacer("githubWriteApi", {
  allowedRequests: 20,
  intervalMs: 60_000,
});

const dispatchRuns = worker.database("dispatchRuns", {
  type: "managed",
  initialTitle: "Notion Dispatch Runs",
  primaryKeyProperty: "Source Page ID",
  schema: {
    properties: {
      Name: Schema.title(),
      "Source Page ID": Schema.richText(),
      "Source URL": Schema.richText(),
      "GitHub Issue URL": Schema.richText(),
      "GitHub Issue Number": Schema.richText(),
      Status: Schema.select([
        { name: "created" },
        { name: "linked" },
        { name: "skipped" },
        { name: "error" },
      ]),
      "Last Processed At": Schema.date(),
      Message: Schema.richText(),
    },
  },
});

const reconciliationRuns = worker.database("reconciliationRuns", {
  type: "managed",
  initialTitle: "GitHub Artifact Reconciliations",
  primaryKeyProperty: "Source Page ID",
  schema: {
    properties: {
      Name: Schema.title(),
      "Source Page ID": Schema.richText(),
      "Source URL": Schema.richText(),
      "GitHub Issue URL": Schema.richText(),
      "GitHub PR URL": Schema.richText(),
      Status: Schema.select([
        { name: "ready-for-engineering" },
        { name: "in-progress" },
        { name: "in-review" },
        { name: "changes-requested" },
        { name: "done" },
        { name: "blocked" },
        { name: "closed" },
        { name: "error" },
      ]),
      "Last Reconciled At": Schema.date(),
      Message: Schema.richText(),
    },
  },
});

export default worker;

worker.tool("dispatchReadyTaskToGitHub", {
  title: "Dispatch Ready Task To GitHub",
  description:
    "Creates a GitHub issue from a Notion-ready engineering task using the repo's handoff template.",
  schema: dispatcherToolSchema,
  outputSchema: dispatcherToolOutputSchema,
  execute: async (rawInput, _context): Promise<DispatcherOutput> => {
    const input = normalizeInput(rawInput);
    const owner = input.owner ?? getRequiredEnv("GITHUB_OWNER");
    const repo = input.repo ?? getRequiredEnv("GITHUB_REPO");
    const labels = buildDispatchLabels(
      input.labels,
      input.founderApprovalGate,
      loadDispatchLabelConfig(["ready-for-engineering"]),
    );
    const body = buildIssueBody(input);

    if (input.dryRun) {
      return {
        dryRun: true,
        owner,
        repo,
        title: input.title,
        labels,
        body,
        issueNumber: null,
        issueUrl: null,
      };
    }

    const token = getRequiredEnv("GITHUB_TOKEN");
    const dispatch = await dispatchIssueToGitHub({
      body,
      labels,
      owner,
      repo,
      sourcePageId: input.sourcePageId,
      title: input.title,
      token,
    });
    const issue = dispatch.issue;

    return {
      dryRun: false,
      owner,
      repo,
      title: input.title,
      labels,
      body,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  },
});

worker.sync("watchReadyTasks", {
  database: dispatchRuns,
  mode: "incremental",
  schedule: "1m",
  execute: async (state: DispatchSyncState | undefined, { notion }) => {
    const syncState = normalizeSyncState(state);
    const config = loadPipelineConfig();
    const sourceDatabase = await notion.dataSources.retrieve({
      data_source_id: config.sourceDataSourceId,
    } as never);
    const sourceProperties = readDatabaseProperties(sourceDatabase as unknown);
    const query = await notion.dataSources.query(
      buildReadyTasksQuery(config, sourceProperties, syncState.cursor) as never,
    );
    const processedAt = new Date().toISOString();
    const pages = readQueryPages(query as unknown);

    const changes = [];
    const dispatched = { ...syncState.dispatched };
    for (const page of pages) {
      if (shouldSkipPageFromState(page, dispatched[page.id])) {
        continue;
      }

      const outcome = await processReadyPage(
        page,
        notion,
        sourceProperties,
        config,
        processedAt,
      );
      dispatched[page.id] = {
        issueNumber: outcome.issueNumber,
        issueUrl: outcome.issueUrl,
        lastEditedTime: outcome.lastEditedTime,
        status: outcome.status,
      };
      changes.push(toDispatchRunChange(outcome));
    }

    const nextCursor = readNextCursor(query as unknown);

    return {
      changes,
      hasMore: nextCursor !== null,
      nextState: {
        cursor: nextCursor ?? undefined,
        dispatched,
      },
    };
  },
});

worker.sync("reconcileGitHubArtifacts", {
  database: reconciliationRuns,
  mode: "incremental",
  schedule: "1m",
  execute: async (state: ReconcileSyncState | undefined, { notion }) => {
    const syncState = normalizeReconcileSyncState(state);
    const config = loadPipelineConfig();
    const sourceDatabase = await notion.dataSources.retrieve({
      data_source_id: config.sourceDataSourceId,
    } as never);
    const sourceProperties = readDatabaseProperties(sourceDatabase as unknown);
    const query = await notion.dataSources.query(
      buildTrackedTasksQuery(config, sourceProperties, syncState.cursor) as never,
    );
    const processedAt = new Date().toISOString();
    const pages = readQueryPages(query as unknown);

    const changes = [];
    const reconciled = { ...syncState.reconciled };
    for (const page of pages) {
      const outcome = await inspectTrackedPage(page, config, processedAt);
      if (outcome == null) {
        continue;
      }

      const nextEntry = toReconcileStateEntry(outcome);
      if (isSameReconcileState(syncState.reconciled?.[page.id], nextEntry)) {
        continue;
      }

      await applyReconciliationOutcome(
        notion,
        page.id,
        sourceProperties,
        config,
        outcome,
      );
      reconciled[page.id] = nextEntry;
      changes.push(toReconciliationRunChange(outcome));
    }

    const nextCursor = readNextCursor(query as unknown);

    return {
      changes,
      hasMore: nextCursor !== null,
      nextState: {
        cursor: nextCursor ?? undefined,
        reconciled,
      },
    };
  },
});

function normalizeInput(input: DispatcherInput): DispatcherInput {
  return {
    ...input,
    acceptanceCriteria: sanitizeRequiredList(
      input.acceptanceCriteria,
      "acceptanceCriteria",
    ),
    founderApprovalGate:
      input.founderApprovalGate?.trim() || null,
    goal: requireText(input.goal, "goal"),
    labels: sanitizeList(input.labels),
    outOfScope: sanitizeList(input.outOfScope),
    owner: input.owner?.trim() || null,
    repo: input.repo?.trim() || null,
    scopeIn: sanitizeList(input.scopeIn),
    sourcePageId: input.sourcePageId?.trim() || null,
    sourceUrl: requireText(input.sourceUrl, "sourceUrl"),
    title: requireText(input.title, "title"),
  };
}

function buildIssueBody(input: DispatcherInput): string {
  const header =
    input.sourcePageId == null
      ? []
      : [`<!-- notion-page-id:${input.sourcePageId} -->`, ""];

  return [
    ...header,
    "## Source of truth",
    input.sourceUrl,
    "",
    "## Goal",
    input.goal,
    "",
    "## Scope (in)",
    renderBullets(input.scopeIn),
    "",
    "## Out of scope / forbidden",
    renderBullets(input.outOfScope),
    "",
    "## Acceptance criteria",
    renderCheckboxes(input.acceptanceCriteria),
    "",
    "## Founder approval gate?",
    input.founderApprovalGate ?? "none",
  ].join("\n");
}

function renderBullets(items: string[] | null): string {
  if (!items || items.length === 0) {
    return "- None specified";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderCheckboxes(items: string[]): string {
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function sanitizeRequiredList(value: string[] | null, field: string): string[] {
  const items = sanitizeList(value);

  if (items.length === 0) {
    throw new Error(`${field} must contain at least one non-empty item`);
  }

  return items;
}

function sanitizeList(value: string[] | null): string[] {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

function requireText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

async function createGitHubIssue(
  request: GitHubIssueRequest,
): Promise<GitHubIssueResponse> {
  await githubWriteApi.wait();

  const response = await fetch(
    `https://api.github.com/repos/${request.owner}/${request.repo}/issues`,
    {
      method: "POST",
      headers: buildGitHubHeaders(request.token),
      body: JSON.stringify({
        title: request.title,
        body: request.body,
        labels: request.labels,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub issue creation failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  const issue = (await response.json()) as GitHubIssueResponse;
  return issue;
}

function buildGitHubHeaders(
  token: string,
  accept = "application/vnd.github+json",
): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "explore-and-earn-notion-dispatcher",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function findExistingGitHubIssue(request: {
  owner: string;
  repo: string;
  sourcePageId: string;
  token: string;
}): Promise<GitHubIssueResponse | null> {
  await githubSearchApi.wait();

  const query = encodeURIComponent(
    `repo:${request.owner}/${request.repo} type:issue "notion-page-id:${request.sourcePageId}"`,
  );
  const response = await fetch(
    `https://api.github.com/search/issues?q=${query}&per_page=1`,
    {
      headers: buildGitHubHeaders(request.token),
      method: "GET",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub issue search failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  const payload = (await response.json()) as {
    items?: Array<{ html_url?: string; number?: number }>;
  };
  const issue = payload.items?.[0];

  if (
    issue == null ||
    typeof issue.html_url !== "string" ||
    typeof issue.number !== "number"
  ) {
    return null;
  }

  return {
    html_url: issue.html_url,
    number: issue.number,
  };
}

function loadPipelineConfig(): PipelineConfig {
  getRequiredEnv("NOTION_API_TOKEN");
  const labelConfig = loadDispatchLabelConfig(["ready-for-engineering"]);

  return {
    blockedStatusLabel: labelConfig.blockedStatusLabel,
    changesRequestedStatusValue: readEnvWithDefault(
      "NOTION_CHANGES_REQUESTED_STATUS_VALUE",
      "Changes Requested",
    ),
    defaultLabels: labelConfig.defaultLabels,
    doneStatusValue: readEnvWithDefault("NOTION_DONE_STATUS_VALUE", "Done"),
    dispatchedStatusValue: readOptionalEnv("NOTION_DISPATCHED_STATUS_VALUE"),
    githubToken: getRequiredEnv("GITHUB_TOKEN"),
    inProgressStatusValue: readEnvWithDefault(
      "NOTION_IN_PROGRESS_STATUS_VALUE",
      "In Progress",
    ),
    inReviewStatusValue: readEnvWithDefault(
      "NOTION_IN_REVIEW_STATUS_VALUE",
      "In Review",
    ),
    owner: getRequiredEnv("GITHUB_OWNER"),
    pageSize: readPositiveIntEnv("NOTION_PAGE_SIZE", 20),
    propertyNames: {
      acceptanceCriteria: readEnvWithDefault(
        "NOTION_ACCEPTANCE_CRITERIA_PROPERTY",
        "Acceptance Criteria",
      ),
      dispatchError: readEnvWithDefault(
        "NOTION_DISPATCH_ERROR_PROPERTY",
        "Dispatch Error",
      ),
      founderApprovalGate: readEnvWithDefault(
        "NOTION_FOUNDER_GATE_PROPERTY",
        "Founder approval gate",
      ),
      goal: readEnvWithDefault("NOTION_GOAL_PROPERTY", "Goal"),
      githubSyncError: readEnvWithDefault(
        "NOTION_GITHUB_SYNC_ERROR_PROPERTY",
        "GitHub Sync Error",
      ),
      issueNumber: readEnvWithDefault(
        "NOTION_ISSUE_NUMBER_PROPERTY",
        "GitHub Issue Number",
      ),
      issueUrl: readEnvWithDefault(
        "NOTION_ISSUE_URL_PROPERTY",
        "GitHub Issue URL",
      ),
      lastGitHubSyncAt: readEnvWithDefault(
        "NOTION_LAST_GITHUB_SYNC_AT_PROPERTY",
        "Last GitHub Sync At",
      ),
      labels: readEnvWithDefault("NOTION_LABELS_PROPERTY", "Labels"),
      lastDispatchAt: readEnvWithDefault(
        "NOTION_LAST_DISPATCH_AT_PROPERTY",
        "Last Dispatch At",
      ),
      outOfScope: readEnvWithDefault(
        "NOTION_OUT_OF_SCOPE_PROPERTY",
        "Out of scope / forbidden",
      ),
      pullRequestNumber: readEnvWithDefault(
        "NOTION_PULL_REQUEST_NUMBER_PROPERTY",
        "GitHub PR Number",
      ),
      pullRequestUrl: readEnvWithDefault(
        "NOTION_PULL_REQUEST_URL_PROPERTY",
        "GitHub PR URL",
      ),
      scopeIn: readEnvWithDefault("NOTION_SCOPE_IN_PROPERTY", "Scope (in)"),
      status: readEnvWithDefault("NOTION_STATUS_PROPERTY", "Status"),
      title: readEnvWithDefault("NOTION_TITLE_PROPERTY", "Name"),
    },
    readyStatusValue: readEnvWithDefault(
      "NOTION_READY_STATUS_VALUE",
      "Ready for Engineering",
    ),
    readyDispatchLabel: labelConfig.readyDispatchLabel,
    repo: getRequiredEnv("GITHUB_REPO"),
    sourceDataSourceId: getRequiredEnv("NOTION_READY_TASKS_DATA_SOURCE_ID"),
  };
}

function loadDispatchLabelConfig(defaultLabelsFallback: string[]): {
  blockedStatusLabel: string;
  defaultLabels: string[];
  readyDispatchLabel: string;
} {
  return {
    blockedStatusLabel: readEnvWithDefault(
      "NOTION_BLOCKED_LABEL",
      "status:blocked",
    ),
    defaultLabels: splitCsvEnv("NOTION_DEFAULT_LABELS", defaultLabelsFallback),
    readyDispatchLabel: readEnvWithDefault(
      "NOTION_READY_LABEL",
      "ready-for-engineering",
    ),
  };
}

function normalizeSyncState(state: DispatchSyncState | undefined): {
  cursor: string | undefined;
  dispatched: Record<string, DispatchStateEntry>;
} {
  return {
    cursor: state?.cursor,
    dispatched: state?.dispatched ?? {},
  };
}

function normalizeReconcileSyncState(state: ReconcileSyncState | undefined): {
  cursor: string | undefined;
  reconciled: Record<string, ReconcileStateEntry>;
} {
  return {
    cursor: state?.cursor,
    reconciled: state?.reconciled ?? {},
  };
}

function readEnvWithDefault(name: string, fallback: string): string {
  return readOptionalEnv(name) ?? fallback;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = readOptionalEnv(name);

  if (raw == null) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitCsvEnv(name: string, fallback: string[]): string[] {
  const raw = readOptionalEnv(name);

  if (raw == null) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readDatabaseProperties(database: unknown): DatabaseProperties {
  if (!isRecord(database) || !isRecord(database.properties)) {
    throw new Error("Could not read Notion database properties for the live pipeline");
  }

  return database.properties as DatabaseProperties;
}

function buildReadyTasksQuery(
  config: PipelineConfig,
  sourceProperties: DatabaseProperties,
  cursor: string | undefined,
): JsonRecord {
  const statusProperty = sourceProperties[config.propertyNames.status];

  if (statusProperty == null) {
    throw new Error(
      `Status property '${config.propertyNames.status}' was not found in the source database`,
    );
  }

  validateConfiguredStatus(statusProperty, config.readyStatusValue, "ready");

  const query: JsonRecord = {
    data_source_id: config.sourceDataSourceId,
    page_size: config.pageSize,
    filter: buildReadyFilter(
      config.propertyNames.status,
      statusProperty,
      config.readyStatusValue,
    ),
  };

  if (cursor) {
    query.start_cursor = cursor;
  }

  return query;
}

function buildTrackedTasksQuery(
  config: PipelineConfig,
  sourceProperties: DatabaseProperties,
  cursor: string | undefined,
): JsonRecord {
  const issueFilters = [
    buildNotEmptyFilter(
      config.propertyNames.issueUrl,
      sourceProperties[config.propertyNames.issueUrl],
    ),
    buildNotEmptyFilter(
      config.propertyNames.issueNumber,
      sourceProperties[config.propertyNames.issueNumber],
    ),
  ].filter((filter): filter is JsonRecord => filter != null);

  const query: JsonRecord = {
    data_source_id: config.sourceDataSourceId,
    page_size: config.pageSize,
  };

  if (issueFilters.length === 0) {
    throw new Error(
      "GitHub reconciliation requires at least one source property for GitHub Issue URL or GitHub Issue Number",
    );
  }

  if (issueFilters.length === 1) {
    query.filter = issueFilters[0];
  } else if (issueFilters.length > 1) {
    query.filter = { or: issueFilters };
  }

  if (cursor) {
    query.start_cursor = cursor;
  }

  return query;
}

function buildNotEmptyFilter(
  propertyName: string,
  property: NotionDatabaseProperty | undefined,
): JsonRecord | null {
  if (property == null) {
    return null;
  }

  switch (property.type) {
    case "number":
      return {
        property: propertyName,
        number: { is_not_empty: true },
      };
    case "rich_text":
      return {
        property: propertyName,
        rich_text: { is_not_empty: true },
      };
    case "title":
      return {
        property: propertyName,
        title: { is_not_empty: true },
      };
    case "url":
      return {
        property: propertyName,
        url: { is_not_empty: true },
      };
    default:
      return null;
  }
}

function validateConfiguredStatus(
  property: NotionDatabaseProperty,
  value: string,
  label: string,
): void {
  if (property.type !== "select" && property.type !== "status") {
    return;
  }

  const options = readOptionNames(property);
  if (options.length > 0 && !options.includes(value)) {
    throw new Error(
      `Configured ${label} status '${value}' is not an option on the '${property.type}' property`,
    );
  }
}

function readOptionNames(property: NotionDatabaseProperty): string[] {
  const config = property[property.type];

  if (!isRecord(config) || !Array.isArray(config.options)) {
    return [];
  }

  return config.options
    .filter(isRecord)
    .map((option) => option.name)
    .filter((name): name is string => typeof name === "string");
}

function buildReadyFilter(
  propertyName: string,
  property: NotionDatabaseProperty,
  readyStatusValue: string,
): JsonRecord {
  switch (property.type) {
    case "rich_text":
      return {
        property: propertyName,
        rich_text: { equals: readyStatusValue },
      };
    case "select":
      return {
        property: propertyName,
        select: { equals: readyStatusValue },
      };
    case "status":
      return {
        property: propertyName,
        status: { equals: readyStatusValue },
      };
    case "title":
      return {
        property: propertyName,
        title: { equals: readyStatusValue },
      };
    default:
      throw new Error(
        `Status property '${propertyName}' must be a title, rich_text, select, or status property`,
      );
  }
}

function readQueryPages(query: unknown): NotionPage[] {
  if (!isRecord(query) || !Array.isArray(query.results)) {
    return [];
  }

  return query.results.filter(isNotionPage);
}

function readNextCursor(query: unknown): string | null {
  if (
    !isRecord(query) ||
    query.has_more !== true ||
    typeof query.next_cursor !== "string"
  ) {
    return null;
  }

  return query.next_cursor;
}

async function processReadyPage(
  page: NotionPage,
  notion: CapabilityContext["notion"],
  sourceProperties: DatabaseProperties,
  config: PipelineConfig,
  processedAt: string,
): Promise<DispatchOutcome> {
  let title = readPropertyText(page, config.propertyNames.title) ?? `Notion page ${page.id}`;
  let issue: GitHubIssueResponse | null = null;

  try {
    const input = buildDispatcherInputFromPage(page, config);
    title = input.title;

    const linkedIssueUrl = readPropertyText(page, config.propertyNames.issueUrl);
    if (linkedIssueUrl) {
      issue = {
        html_url: linkedIssueUrl,
        number: readExistingIssueNumber(page, config) ?? 0,
      };
      await updateSourcePageAfterDispatch(
        notion,
        page.id,
        sourceProperties,
        config,
        issue,
        processedAt,
      );

      return {
        issueNumber: issue.number === 0 ? null : issue.number,
        issueUrl: issue.html_url,
        lastEditedTime: page.last_edited_time ?? null,
        message: "Issue was already linked on the source page.",
        processedAt,
        sourcePageId: page.id,
        sourceUrl: page.url,
        status: "skipped",
        title,
      };
    }

    const dispatch = await dispatchIssueToGitHub({
      body: buildIssueBody(input),
      labels: buildDispatchLabels(
        input.labels,
        input.founderApprovalGate,
        config,
      ),
      owner: config.owner,
      repo: config.repo,
      sourcePageId: page.id,
      title: input.title,
      token: config.githubToken,
    });
    issue = dispatch.issue;

    await updateSourcePageAfterDispatch(
      notion,
      page.id,
      sourceProperties,
      config,
      issue,
      processedAt,
    );

    return {
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      lastEditedTime: page.last_edited_time ?? null,
      message:
        dispatch.resolution === "created"
          ? "Created a new GitHub issue from the Notion page."
          : "Found an existing GitHub issue and linked it back to the Notion page.",
      processedAt,
      sourcePageId: page.id,
      sourceUrl: page.url,
      status: dispatch.resolution,
      title,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await maybeUpdateSourcePageError(
      notion,
      page.id,
      sourceProperties,
      config,
      message,
      processedAt,
    );

    return {
      issueNumber: issue?.number ?? null,
      issueUrl: issue?.html_url ?? null,
      lastEditedTime: page.last_edited_time ?? null,
      message,
      processedAt,
      sourcePageId: page.id,
      sourceUrl: page.url,
      status: "error",
      title,
    };
  }
}

async function inspectTrackedPage(
  page: NotionPage,
  config: PipelineConfig,
  processedAt: string,
): Promise<ReconcileOutcome | null> {
  const title = readPropertyText(page, config.propertyNames.title) ?? `Notion page ${page.id}`;
  const issueNumber = readExistingIssueNumber(page, config);

  if (issueNumber == null) {
    return null;
  }

  try {
    const issue = await fetchGitHubIssueDetail({
      issueNumber,
      owner: config.owner,
      repo: config.repo,
      token: config.githubToken,
    });
    const pullRequest = await findLinkedPullRequest({
      issueNumber,
      owner: config.owner,
      repo: config.repo,
      token: config.githubToken,
    });
    const latestReviewState =
      pullRequest && pullRequest.state === "open" && pullRequest.draft !== true
        ? await fetchLatestPullRequestReviewState({
            owner: config.owner,
            pullRequestNumber: pullRequest.number,
            repo: config.repo,
            token: config.githubToken,
          })
        : null;
    const resolved = resolveLifecycleStatus(
      issue,
      pullRequest,
      latestReviewState,
      config,
    );

    return {
      issueNumber: issue.number,
      issueUpdatedAt: issue.updated_at ?? null,
      issueUrl: issue.html_url,
      message: resolved.message,
      notionStatusValue: resolved.notionStatusValue,
      processedAt,
      pullRequestNumber: pullRequest?.number ?? null,
      pullRequestUpdatedAt: pullRequest?.updated_at ?? null,
      pullRequestUrl: pullRequest?.html_url ?? null,
      sourcePageId: page.id,
      sourceUrl: page.url,
      status: resolved.status,
      title,
    };
  } catch (error) {
    return {
      issueNumber,
      issueUpdatedAt: null,
      issueUrl: readPropertyText(page, config.propertyNames.issueUrl),
      message: error instanceof Error ? error.message : String(error),
      notionStatusValue: null,
      processedAt,
      pullRequestNumber: null,
      pullRequestUpdatedAt: null,
      pullRequestUrl: readPropertyText(page, config.propertyNames.pullRequestUrl),
      sourcePageId: page.id,
      sourceUrl: page.url,
      status: "error",
      title,
    };
  }
}

function buildDispatcherInputFromPage(
  page: NotionPage,
  config: PipelineConfig,
): DispatcherInput {
  const propertyNames = config.propertyNames;
  const propertyLabels = readPropertyList(page, propertyNames.labels);
  const labels = buildDispatchLabels(
    [...(propertyLabels ?? []), ...config.defaultLabels],
    readPropertyText(page, propertyNames.founderApprovalGate),
    config,
  );

  return normalizeInput({
    acceptanceCriteria:
      readPropertyList(page, propertyNames.acceptanceCriteria) ?? [],
    dryRun: false,
    founderApprovalGate: readPropertyText(page, propertyNames.founderApprovalGate),
    goal: requireText(
      readPropertyText(page, propertyNames.goal),
      `Missing required Notion property '${propertyNames.goal}' on page ${page.id}`,
    ),
    labels: labels.length === 0 ? null : labels,
    outOfScope: readPropertyList(page, propertyNames.outOfScope),
    owner: config.owner,
    repo: config.repo,
    scopeIn: readPropertyList(page, propertyNames.scopeIn),
    sourcePageId: page.id,
    sourceUrl: page.url,
    title: requireText(
      readPropertyText(page, propertyNames.title),
      `Missing required Notion property '${propertyNames.title}' on page ${page.id}`,
    ),
  });
}

function readPropertyText(page: NotionPage, propertyName: string): string | null {
  const property = page.properties[propertyName];

  if (!isRecord(property) || typeof property.type !== "string") {
    return null;
  }

  switch (property.type) {
    case "checkbox":
      return typeof property.checkbox === "boolean"
        ? String(property.checkbox)
        : null;
    case "date":
      return isRecord(property.date) && typeof property.date.start === "string"
        ? property.date.start
        : null;
    case "email":
      return typeof property.email === "string" ? property.email : null;
    case "multi_select":
      return readNamedList(property.multi_select).join(", ");
    case "number":
      return typeof property.number === "number" ? String(property.number) : null;
    case "phone_number":
      return typeof property.phone_number === "string"
        ? property.phone_number
        : null;
    case "rich_text":
      return joinPlainText(property.rich_text);
    case "select":
      return isRecord(property.select) && typeof property.select.name === "string"
        ? property.select.name
        : null;
    case "status":
      return isRecord(property.status) && typeof property.status.name === "string"
        ? property.status.name
        : null;
    case "title":
      return joinPlainText(property.title);
    case "url":
      return typeof property.url === "string" ? property.url : null;
    default:
      return null;
  }
}

function readPropertyList(page: NotionPage, propertyName: string): string[] | null {
  const property = page.properties[propertyName];

  if (!isRecord(property) || typeof property.type !== "string") {
    return null;
  }

  if (property.type === "multi_select") {
    const values = readNamedList(property.multi_select);
    return values.length === 0 ? null : values;
  }

  const raw = readPropertyText(page, propertyName);
  if (!raw) {
    return null;
  }

  const list = raw
    .split(splitFreeformList(raw))
    .map((item) => item.replace(/^[-*\d.[\]()\s]+/, "").trim())
    .filter(Boolean);

  return list.length === 0 ? null : list;
}

function splitFreeformList(raw: string): RegExp {
  return raw.includes("\n") ? /\r?\n+/ : /;/;
}

function joinPlainText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .filter(isRecord)
    .map((item) => item.plain_text)
    .filter((part): part is string => typeof part === "string")
    .join("")
    .trim();

  return text === "" ? null : text;
}

function readNamedList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => item.name)
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean);
}

function readExistingIssueNumber(
  page: NotionPage,
  config: PipelineConfig,
): number | null {
  const rawNumber = readPropertyText(page, config.propertyNames.issueNumber);
  if (rawNumber) {
    const parsed = Number.parseInt(rawNumber, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return parseIssueNumberFromUrl(
    readPropertyText(page, config.propertyNames.issueUrl),
  );
}

function shouldSkipPageFromState(
  page: NotionPage,
  priorDispatch: DispatchStateEntry | undefined,
): boolean {
  if (!priorDispatch) {
    return false;
  }

  if (priorDispatch.status === "error") {
    return priorDispatch.lastEditedTime === (page.last_edited_time ?? null);
  }

  return true;
}

function buildDispatchLabels(
  labels: string[] | null,
  founderApprovalGate: string | null,
  config: Pick<PipelineConfig, "blockedStatusLabel" | "readyDispatchLabel"> & {
    defaultLabels?: string[];
  },
): string[] {
  const labelSet = new Set([...(config.defaultLabels ?? []), ...sanitizeList(labels)]);
  const gateLabel = mapFounderGateToLabel(founderApprovalGate);

  if (gateLabel) {
    labelSet.delete(config.readyDispatchLabel);
    labelSet.add(config.blockedStatusLabel);
    labelSet.add(gateLabel);
  } else {
    labelSet.add(config.readyDispatchLabel);
  }

  return Array.from(labelSet);
}

function mapFounderGateToLabel(founderApprovalGate: string | null): string | null {
  const normalized = founderApprovalGate?.trim().toLowerCase();

  if (!normalized || normalized === "none") {
    return null;
  }

  if (normalized.startsWith("gate:")) {
    return normalized;
  }

  const gateMap: Array<[string, string]> = [
    ["money", "gate:money"],
    ["billing", "gate:money"],
    ["auth", "gate:auth"],
    ["security", "gate:auth"],
    ["db destructive", "gate:db-destructive"],
    ["database destructive", "gate:db-destructive"],
    ["permissions", "gate:permissions"],
    ["rls", "gate:permissions"],
    ["trust", "gate:trust-safety"],
    ["verification", "gate:trust-safety"],
    ["legal", "gate:legal"],
    ["policy", "gate:legal"],
    ["asset", "gate:asset-license"],
    ["license", "gate:asset-license"],
    ["launch", "gate:launch"],
    ["deploy", "gate:launch"],
    ["product philosophy", "gate:product-philosophy"],
    ["philosophy", "gate:product-philosophy"],
  ];

  const match = gateMap.find(([needle]) => normalized.includes(needle));
  return match?.[1] ?? null;
}

async function dispatchIssueToGitHub(request: {
  body: string;
  labels: string[];
  owner: string;
  repo: string;
  sourcePageId: string | null;
  title: string;
  token: string;
}): Promise<{ issue: GitHubIssueResponse; resolution: "created" | "linked" }> {
  const existingIssue =
    request.sourcePageId == null
      ? null
      : await findExistingGitHubIssue({
          owner: request.owner,
          repo: request.repo,
          sourcePageId: request.sourcePageId,
          token: request.token,
        });

  if (existingIssue) {
    return {
      issue: existingIssue,
      resolution: "linked",
    };
  }

  return {
    issue: await createGitHubIssue({
      owner: request.owner,
      repo: request.repo,
      token: request.token,
      title: request.title,
      body: request.body,
      labels: request.labels,
    }),
    resolution: "created",
  };
}

function parseIssueNumberFromUrl(url: string | null): number | null {
  if (url == null) {
    return null;
  }

  const match = url.match(/\/issues\/(\d+)(?:$|[/?#])/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function updateSourcePageAfterDispatch(
  notion: CapabilityContext["notion"],
  pageId: string,
  sourceProperties: DatabaseProperties,
  config: PipelineConfig,
  issue: GitHubIssueResponse,
  processedAt: string,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.issueUrl,
    { kind: "text", value: issue.html_url },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.issueNumber,
    { kind: "number", value: issue.number },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.lastDispatchAt,
    { kind: "datetime", value: processedAt },
  );

  if (config.dispatchedStatusValue) {
    validateConfiguredStatus(
      sourceProperties[config.propertyNames.status],
      config.dispatchedStatusValue,
      "dispatched",
    );
    setPagePropertyUpdate(
      updates,
      sourceProperties,
      config.propertyNames.status,
      { kind: "option", value: config.dispatchedStatusValue },
    );
  }

  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.dispatchError,
    { kind: "clear" },
  );

  await applySourcePageUpdates(notion, pageId, updates);
}

async function applyReconciliationOutcome(
  notion: CapabilityContext["notion"],
  pageId: string,
  sourceProperties: DatabaseProperties,
  config: PipelineConfig,
  outcome: ReconcileOutcome,
): Promise<void> {
  if (outcome.status === "error") {
    await maybeUpdateReconciliationError(
      notion,
      pageId,
      sourceProperties,
      config,
      outcome.message,
      outcome.processedAt,
    );
    return;
  }

  const updates: Record<string, unknown> = {};

  if (outcome.issueUrl) {
    setPagePropertyUpdate(
      updates,
      sourceProperties,
      config.propertyNames.issueUrl,
      { kind: "text", value: outcome.issueUrl },
    );
  }
  if (outcome.issueNumber != null) {
    setPagePropertyUpdate(
      updates,
      sourceProperties,
      config.propertyNames.issueNumber,
      { kind: "number", value: outcome.issueNumber },
    );
  }

  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.pullRequestUrl,
    outcome.pullRequestUrl == null
      ? { kind: "clear" }
      : { kind: "text", value: outcome.pullRequestUrl },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.pullRequestNumber,
    outcome.pullRequestNumber == null
      ? { kind: "clear" }
      : { kind: "number", value: outcome.pullRequestNumber },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.lastGitHubSyncAt,
    { kind: "datetime", value: outcome.processedAt },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.githubSyncError,
    { kind: "clear" },
  );

  if (outcome.notionStatusValue) {
    validateConfiguredStatus(
      sourceProperties[config.propertyNames.status],
      outcome.notionStatusValue,
      "reconciled",
    );
    setPagePropertyUpdate(
      updates,
      sourceProperties,
      config.propertyNames.status,
      { kind: "option", value: outcome.notionStatusValue },
    );
  }

  await applySourcePageUpdates(notion, pageId, updates);
}

async function maybeUpdateSourcePageError(
  notion: CapabilityContext["notion"],
  pageId: string,
  sourceProperties: DatabaseProperties,
  config: PipelineConfig,
  message: string,
  processedAt: string,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.dispatchError,
    { kind: "text", value: message },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.lastDispatchAt,
    { kind: "datetime", value: processedAt },
  );

  try {
    await applySourcePageUpdates(notion, pageId, updates);
  } catch {
    return;
  }
}

async function maybeUpdateReconciliationError(
  notion: CapabilityContext["notion"],
  pageId: string,
  sourceProperties: DatabaseProperties,
  config: PipelineConfig,
  message: string,
  processedAt: string,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.githubSyncError,
    { kind: "text", value: message },
  );
  setPagePropertyUpdate(
    updates,
    sourceProperties,
    config.propertyNames.lastGitHubSyncAt,
    { kind: "datetime", value: processedAt },
  );

  try {
    await applySourcePageUpdates(notion, pageId, updates);
  } catch {
    return;
  }
}

async function fetchGitHubIssueDetail(request: {
  issueNumber: number;
  owner: string;
  repo: string;
  token: string;
}): Promise<GitHubIssueDetail> {
  await githubReadApi.wait();

  const response = await fetch(
    `https://api.github.com/repos/${request.owner}/${request.repo}/issues/${request.issueNumber}`,
    {
      headers: buildGitHubHeaders(request.token),
      method: "GET",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub issue read failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return (await response.json()) as GitHubIssueDetail;
}

async function findLinkedPullRequest(request: {
  issueNumber: number;
  owner: string;
  repo: string;
  token: string;
}): Promise<GitHubPullRequestDetail | null> {
  const pullRequestNumbers = await fetchLinkedPullRequestNumbers(request);
  if (pullRequestNumbers.length === 0) {
    return null;
  }

  const pullRequests = await Promise.all(
    pullRequestNumbers.map((pullRequestNumber) =>
      fetchGitHubPullRequestDetail({
        owner: request.owner,
        pullRequestNumber,
        repo: request.repo,
        token: request.token,
      }),
    ),
  );

  return pullRequests.sort(comparePullRequestsByFreshness)[0] ?? null;
}

async function fetchLinkedPullRequestNumbers(request: {
  issueNumber: number;
  owner: string;
  repo: string;
  token: string;
}): Promise<number[]> {
  await githubReadApi.wait();

  const response = await fetch(
    `https://api.github.com/repos/${request.owner}/${request.repo}/issues/${request.issueNumber}/timeline?per_page=100`,
    {
      headers: buildGitHubHeaders(request.token),
      method: "GET",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub issue timeline read failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return readLinkedPullRequestNumbers(await response.json());
}

async function fetchGitHubPullRequestDetail(request: {
  owner: string;
  pullRequestNumber: number;
  repo: string;
  token: string;
}): Promise<GitHubPullRequestDetail> {
  await githubReadApi.wait();

  const response = await fetch(
    `https://api.github.com/repos/${request.owner}/${request.repo}/pulls/${request.pullRequestNumber}`,
    {
      headers: buildGitHubHeaders(request.token),
      method: "GET",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub pull request read failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return (await response.json()) as GitHubPullRequestDetail;
}

async function fetchLatestPullRequestReviewState(request: {
  owner: string;
  pullRequestNumber: number;
  repo: string;
  token: string;
}): Promise<string | null> {
  await githubReadApi.wait();

  const response = await fetch(
    `https://api.github.com/repos/${request.owner}/${request.repo}/pulls/${request.pullRequestNumber}/reviews?per_page=100`,
    {
      headers: buildGitHubHeaders(request.token),
      method: "GET",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub pull request review read failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  return readLatestReviewState(await response.json());
}

function readLinkedPullRequestNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const numbers = new Set<number>();
  for (const event of value) {
    if (!isRecord(event)) {
      continue;
    }

    if (
      event.event !== "cross-referenced" &&
      event.event !== "connected"
    ) {
      continue;
    }

    const source = isRecord(event.source) ? event.source : null;
    const issue = source && isRecord(source.issue) ? source.issue : null;
    if (!issue || !isRecord(issue.pull_request) || typeof issue.number !== "number") {
      continue;
    }

    numbers.add(issue.number);
  }

  return Array.from(numbers);
}

function comparePullRequestsByFreshness(
  left: GitHubPullRequestDetail,
  right: GitHubPullRequestDetail,
): number {
  const leftScore = Date.parse(left.updated_at ?? left.merged_at ?? "1970-01-01T00:00:00.000Z");
  const rightScore = Date.parse(
    right.updated_at ?? right.merged_at ?? "1970-01-01T00:00:00.000Z",
  );

  return rightScore - leftScore;
}

function resolveLifecycleStatus(
  issue: GitHubIssueDetail,
  pullRequest: GitHubPullRequestDetail | null,
  latestReviewState: string | null,
  config: PipelineConfig,
): { message: string; notionStatusValue: string | null; status: ReconcileRunStatus } {
  if (pullRequest?.merged_at) {
    return {
      message: "Linked pull request merged.",
      notionStatusValue: config.doneStatusValue,
      status: "done",
    };
  }

  if (pullRequest?.state === "open") {
    if (pullRequest.draft === true) {
      return {
        message: "Draft pull request is open.",
        notionStatusValue: config.inProgressStatusValue,
        status: "in-progress",
      };
    }

    if (latestReviewState === "CHANGES_REQUESTED") {
      return {
        message: "Pull request has changes requested.",
        notionStatusValue: config.changesRequestedStatusValue,
        status: "changes-requested",
      };
    }

    return {
      message: "Linked pull request is open.",
      notionStatusValue: config.inReviewStatusValue,
      status: "in-review",
    };
  }

  if (pullRequest?.state === "closed") {
    return {
      message: "Linked pull request closed without merge.",
      notionStatusValue: config.inProgressStatusValue,
      status: "in-progress",
    };
  }

  if (readGitHubLabelNames(issue.labels).includes(config.blockedStatusLabel)) {
    return {
      message: "GitHub issue remains founder-blocked.",
      notionStatusValue: null,
      status: "blocked",
    };
  }

  if (issue.state === "open") {
    if ((issue.assignees ?? []).length > 0) {
      return {
        message: "GitHub issue is assigned and in progress.",
        notionStatusValue: config.inProgressStatusValue,
        status: "in-progress",
      };
    }

    return {
      message: "GitHub issue is open and ready for engineering.",
      notionStatusValue: config.readyStatusValue,
      status: "ready-for-engineering",
    };
  }

  if (issue.state === "closed" && issue.state_reason === "completed") {
    return {
      message: "GitHub issue closed as completed.",
      notionStatusValue: config.doneStatusValue,
      status: "done",
    };
  }

  return {
    message: "GitHub issue is closed without a merged pull request.",
    notionStatusValue: null,
    status: "closed",
  };
}

function readGitHubLabelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((label) => {
      if (typeof label === "string") {
        return label;
      }

      if (isRecord(label) && typeof label.name === "string") {
        return label.name;
      }

      return null;
    })
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim())
    .filter(Boolean);
}

function readLatestReviewState(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const meaningfulReviews = value
    .filter(isRecord)
    .filter((review) => typeof review.state === "string")
    .filter((review) => review.state !== "COMMENTED" && review.state !== "PENDING");

  const latestReview = meaningfulReviews.sort((left, right) => {
    const leftScore = Date.parse(
      typeof left.submitted_at === "string"
        ? left.submitted_at
        : "1970-01-01T00:00:00.000Z",
    );
    const rightScore = Date.parse(
      typeof right.submitted_at === "string"
        ? right.submitted_at
        : "1970-01-01T00:00:00.000Z",
    );

    return rightScore - leftScore;
  })[0];

  return latestReview && typeof latestReview.state === "string"
    ? latestReview.state
    : null;
}

function toReconcileStateEntry(outcome: ReconcileOutcome): ReconcileStateEntry {
  return {
    issueUpdatedAt: outcome.issueUpdatedAt,
    message: outcome.message,
    pullRequestUpdatedAt: outcome.pullRequestUpdatedAt,
    status: outcome.status,
  };
}

function isSameReconcileState(
  left: ReconcileStateEntry | undefined,
  right: ReconcileStateEntry,
): boolean {
  return (
    left?.issueUpdatedAt === right.issueUpdatedAt &&
    left?.message === right.message &&
    left?.pullRequestUpdatedAt === right.pullRequestUpdatedAt &&
    left?.status === right.status
  );
}

async function applySourcePageUpdates(
  notion: CapabilityContext["notion"],
  pageId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(updates).length === 0) {
    return;
  }

  await notion.pages.update({
    page_id: pageId,
    properties: updates,
  } as never);
}

function setPagePropertyUpdate(
  updates: Record<string, unknown>,
  sourceProperties: DatabaseProperties,
  propertyName: string,
  intent: PageUpdateIntent,
): void {
  const property = sourceProperties[propertyName];
  if (property == null) {
    return;
  }

  const update = toPagePropertyUpdate(property, intent);
  if (update != null) {
    updates[propertyName] = update;
  }
}

function toPagePropertyUpdate(
  property: NotionDatabaseProperty,
  intent: PageUpdateIntent,
): Record<string, unknown> | null {
  if (intent.kind === "clear") {
    switch (property.type) {
      case "date":
        return { date: null };
      case "number":
        return { number: null };
      case "rich_text":
        return { rich_text: [] };
      case "select":
        return { select: null };
      case "status":
        return { status: null };
      case "title":
        return { title: [] };
      case "url":
        return { url: null };
      default:
        return null;
    }
  }

  switch (property.type) {
    case "date":
      return {
        date: {
          start:
            intent.kind === "datetime"
              ? intent.value
              : intent.kind === "text"
                ? intent.value
                : new Date().toISOString(),
        },
      };
    case "number":
      return {
        number:
          intent.kind === "number"
            ? intent.value
            : intent.kind === "text"
              ? Number.parseInt(intent.value, 10)
              : null,
      };
    case "rich_text":
      return {
        rich_text: toRichTextArray(
          intent.kind === "number" ? String(intent.value) : intent.value,
        ),
      };
    case "select":
      return {
        select: {
          name:
            intent.kind === "number" ? String(intent.value) : intent.value,
        },
      };
    case "status":
      return {
        status: {
          name:
            intent.kind === "number" ? String(intent.value) : intent.value,
        },
      };
    case "title":
      return {
        title: toRichTextArray(
          intent.kind === "number" ? String(intent.value) : intent.value,
        ),
      };
    case "url":
      return {
        url:
          intent.kind === "number" ? String(intent.value) : intent.value,
      };
    default:
      return null;
  }
}

function toRichTextArray(value: string): Array<{ text: { content: string } }> {
  if (value === "") {
    return [];
  }

  return [{ text: { content: value.slice(0, 1900) } }];
}

function toDispatchRunChange(outcome: DispatchOutcome) {
  return {
    type: "upsert" as const,
    key: outcome.sourcePageId,
    properties: {
      Name: Builder.title(outcome.title),
      "Source Page ID": Builder.richText(outcome.sourcePageId),
      "Source URL": Builder.richText(outcome.sourceUrl),
      "GitHub Issue URL": Builder.richText(outcome.issueUrl ?? ""),
      "GitHub Issue Number": Builder.richText(
        outcome.issueNumber == null ? "" : String(outcome.issueNumber),
      ),
      Status: Builder.select(outcome.status),
      "Last Processed At": Builder.dateTime(outcome.processedAt),
      Message: Builder.richText(outcome.message),
    },
    upstreamUpdatedAt: outcome.processedAt,
  };
}

function toReconciliationRunChange(outcome: ReconcileOutcome) {
  return {
    type: "upsert" as const,
    key: outcome.sourcePageId,
    properties: {
      Name: Builder.title(outcome.title),
      "Source Page ID": Builder.richText(outcome.sourcePageId),
      "Source URL": Builder.richText(outcome.sourceUrl),
      "GitHub Issue URL": Builder.richText(outcome.issueUrl ?? ""),
      "GitHub PR URL": Builder.richText(outcome.pullRequestUrl ?? ""),
      Status: Builder.select(outcome.status),
      "Last Reconciled At": Builder.dateTime(outcome.processedAt),
      Message: Builder.richText(outcome.message),
    },
    upstreamUpdatedAt:
      outcome.pullRequestUpdatedAt ?? outcome.issueUpdatedAt ?? outcome.processedAt,
  };
}

function isNotionPage(value: unknown): value is NotionPage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    isRecord(value.properties)
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}