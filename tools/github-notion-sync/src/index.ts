import { Worker } from "@notionhq/workers"
import * as Schema from "@notionhq/workers/schema"
import * as Builder from "@notionhq/workers/builder"

/**
 * GitHub → Notion mirror sync.
 *
 * Mirrors every issue and pull request from the Explore&Earn repo into a
 * managed Notion database, refreshed on a schedule. One direction only: this
 * worker never writes to GitHub, so it can't corrupt implementation truth.
 *
 * Source of truth: Notion canon page "GitHub → Notion Sync Worker — Build Pack".
 * API verified against https://developers.notion.com/workers/reference/schema
 */

const worker = new Worker()
export default worker

const GITHUB_API = "https://api.github.com"
const OWNER = process.env.GITHUB_OWNER ?? "AutomatedEmpires"
const REPO = process.env.GITHUB_REPO ?? "explore-and-earn"
const PER_PAGE = 50

// Managed Notion database this sync owns. Properties declared here are
// controlled by the worker; users may add extra properties in Notion.
const repoItems = worker.database("repoItems", {
	type: "managed",
	initialTitle: "Explore&Earn — GitHub",
	primaryKeyProperty: "Node ID",
	schema: {
		properties: {
			Title: Schema.title(),
			"Node ID": Schema.richText(),
			Number: Schema.number(),
			Type: Schema.select([
				{ name: "Pull Request", color: "purple" },
				{ name: "Issue", color: "blue" },
			]),
			State: Schema.select([
				{ name: "Open", color: "green" },
				{ name: "Closed", color: "red" },
				{ name: "Merged", color: "purple" },
			]),
			Author: Schema.richText(),
			Labels: Schema.richText(),
			Branch: Schema.richText(),
			URL: Schema.url(),
			Created: Schema.date(),
			Updated: Schema.date(),
		},
	},
})

interface GitHubUser {
	login?: string
}

interface GitHubLabel {
	name?: string
}

interface GitHubIssue {
	node_id: string
	number: number
	title: string
	state: string
	user?: GitHubUser | null
	labels?: Array<GitHubLabel | string>
	html_url: string
	created_at: string
	updated_at: string
	pull_request?: unknown
}

interface GitHubPull {
	node_id: string
	number: number
	title: string
	state: string
	merged_at?: string | null
	user?: GitHubUser | null
	labels?: Array<GitHubLabel | string>
	head?: { ref?: string } | null
	html_url: string
	created_at: string
	updated_at: string
}

async function gh<T>(path: string): Promise<T[]> {
	const res = await fetch(`${GITHUB_API}${path}`, {
		headers: {
			Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "explore-earn-notion-worker",
		},
	})
	if (!res.ok) {
		throw new Error(`GitHub ${path} -> ${res.status} ${res.statusText}`)
	}
	return (await res.json()) as T[]
}

function labelNames(labels: Array<GitHubLabel | string> | undefined): string {
	return (labels ?? [])
		.map((l) => (typeof l === "string" ? l : l?.name))
		.filter((name): name is string => Boolean(name))
		.join(", ")
}

function issueToUpsert(issue: GitHubIssue) {
	return {
		type: "upsert" as const,
		key: issue.node_id,
		properties: {
			Title: Builder.title(`#${issue.number} ${issue.title}`),
			"Node ID": Builder.richText(issue.node_id),
			Number: Builder.number(issue.number),
			Type: Builder.select("Issue"),
			State: Builder.select(issue.state === "closed" ? "Closed" : "Open"),
			Author: Builder.richText(issue.user?.login ?? ""),
			Labels: Builder.richText(labelNames(issue.labels)),
			URL: Builder.url(issue.html_url),
			Created: Builder.dateTime(issue.created_at),
			Updated: Builder.dateTime(issue.updated_at),
		},
	}
}

function pullToUpsert(pr: GitHubPull) {
	const state = pr.merged_at
		? "Merged"
		: pr.state === "closed"
			? "Closed"
			: "Open"
	return {
		type: "upsert" as const,
		key: pr.node_id,
		properties: {
			Title: Builder.title(`#${pr.number} ${pr.title}`),
			"Node ID": Builder.richText(pr.node_id),
			Number: Builder.number(pr.number),
			Type: Builder.select("Pull Request"),
			State: Builder.select(state),
			Author: Builder.richText(pr.user?.login ?? ""),
			Labels: Builder.richText(labelNames(pr.labels)),
			Branch: Builder.richText(pr.head?.ref ?? ""),
			URL: Builder.url(pr.html_url),
			Created: Builder.dateTime(pr.created_at),
			Updated: Builder.dateTime(pr.updated_at),
		},
	}
}

// Mirror all issues + PRs. "replace" mode prunes anything not seen this cycle,
// so closed/deleted items naturally fall out of the Notion database. The repo
// is small, so we paginate fully within one execute call and report hasMore:
// false (no reliance on an unverified cursor shape).
worker.sync("githubSync", {
	database: repoItems,
	mode: "replace",
	schedule: "30m",
	execute: async () => {
		const changes: Array<
			ReturnType<typeof issueToUpsert> | ReturnType<typeof pullToUpsert>
		> = []

		// Phase 1: issues. The issues endpoint also returns PRs, so drop anything
		// carrying a pull_request field — PRs are synced in phase 2.
		for (let page = 1; ; page++) {
			const items = await gh<GitHubIssue>(
				`/repos/${OWNER}/${REPO}/issues?state=all&per_page=${PER_PAGE}&page=${page}`,
			)
			for (const it of items) {
				if (!it.pull_request) changes.push(issueToUpsert(it))
			}
			if (items.length < PER_PAGE) break
		}

		// Phase 2: pulls (needed to distinguish Merged from Closed).
		for (let page = 1; ; page++) {
			const items = await gh<GitHubPull>(
				`/repos/${OWNER}/${REPO}/pulls?state=all&per_page=${PER_PAGE}&page=${page}`,
			)
			for (const pr of items) {
				changes.push(pullToUpsert(pr))
			}
			if (items.length < PER_PAGE) break
		}

		return { changes, hasMore: false }
	},
})
