import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Webhook } from "svix"

export const runtime = "nodejs"

type ClerkWebhookEventType = "user.created" | "user.updated" | "user.deleted"

interface ClerkEmailAddress {
	readonly id: string
	readonly email_address: string
}

interface ClerkUserPayload {
	readonly id?: string
	readonly created_at?: number
	readonly email_addresses?: ReadonlyArray<ClerkEmailAddress>
	readonly primary_email_address_id?: string | null
}

interface ClerkWebhookEvent {
	readonly type: ClerkWebhookEventType | string
	readonly data: ClerkUserPayload
}

type JsonObject = Record<string, string | number | boolean | null>

class SupabaseServiceRoleRestClient {
	private readonly restUrl: string

	constructor(
		private readonly supabaseUrl: string,
		private readonly serviceRoleKey: string,
	) {
		this.restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`
	}

	async insert(table: string, values: JsonObject): Promise<void> {
		await this.write(table, {
			method: "POST",
			body: JSON.stringify(values),
		})
	}

	async update(
		table: string,
		filter: Record<string, string>,
		values: JsonObject,
	): Promise<void> {
		const params = new URLSearchParams(filter)

		await this.write(`${table}?${params.toString()}`, {
			method: "PATCH",
			body: JSON.stringify(values),
		})
	}

	private async write(path: string, init: RequestInit): Promise<void> {
		const response = await fetch(`${this.restUrl}/${path}`, {
			...init,
			headers: {
				apikey: this.serviceRoleKey,
				Authorization: `Bearer ${this.serviceRoleKey}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
		})

		if (!response.ok) {
			const body = await response.text()
			throw new Error(`Supabase service-role write failed: ${response.status} ${body}`)
		}
	}
}

function getSupabaseServiceRoleClient(): SupabaseServiceRoleRestClient {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Missing Supabase service-role configuration for Clerk webhook writes.",
		)
	}

	return new SupabaseServiceRoleRestClient(supabaseUrl, serviceRoleKey)
}

function primaryEmailForUser(user: ClerkUserPayload): string | null {
	const emails = user.email_addresses ?? []
	const primaryEmail = emails.find(
		(email) => email.id === user.primary_email_address_id,
	)

	return primaryEmail?.email_address ?? emails[0]?.email_address ?? null
}

function createdAtForUser(user: ClerkUserPayload): string {
	return typeof user.created_at === "number"
		? new Date(user.created_at).toISOString()
		: new Date().toISOString()
}

async function verifyClerkEvent(payload: string): Promise<ClerkWebhookEvent> {
	const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

	if (!webhookSecret) {
		throw new Error("Missing CLERK_WEBHOOK_SECRET for Clerk webhook verification.")
	}

	const headerStore = await headers()
	const webhook = new Webhook(webhookSecret)

	return webhook.verify(payload, {
		"svix-id": headerStore.get("svix-id") ?? "",
		"svix-timestamp": headerStore.get("svix-timestamp") ?? "",
		"svix-signature": headerStore.get("svix-signature") ?? "",
	}) as ClerkWebhookEvent
}

async function syncUserCreated(
	client: SupabaseServiceRoleRestClient,
	user: ClerkUserPayload,
): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.created payload is missing data.id.")
	}

	await client.insert("users_profile_shadow", {
		clerk_user_id: user.id,
		email: primaryEmailForUser(user),
		created_at: createdAtForUser(user),
	})

	await client.insert("seeker_profiles", {
		clerk_user_id: user.id,
	})
}

async function syncUserUpdated(
	client: SupabaseServiceRoleRestClient,
	user: ClerkUserPayload,
): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.updated payload is missing data.id.")
	}

	await client.update(
		"users_profile_shadow",
		{ clerk_user_id: `eq.${user.id}` },
		{ email: primaryEmailForUser(user) },
	)
}

async function syncUserDeleted(
	client: SupabaseServiceRoleRestClient,
	user: ClerkUserPayload,
): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.deleted payload is missing data.id.")
	}

	await client.update(
		"users_profile_shadow",
		{ clerk_user_id: `eq.${user.id}` },
		{ deleted_at: new Date().toISOString() },
	)
}

export async function POST(request: Request) {
	const payload = await request.text()
	let event: ClerkWebhookEvent

	try {
		event = await verifyClerkEvent(payload)
	} catch {
		return NextResponse.json(
			{ error: "Invalid Clerk webhook signature." },
			{ status: 400 },
		)
	}

	try {
		const client = getSupabaseServiceRoleClient()

		switch (event.type) {
			case "user.created":
				await syncUserCreated(client, event.data)
				break
			case "user.updated":
				await syncUserUpdated(client, event.data)
				break
			case "user.deleted":
				await syncUserDeleted(client, event.data)
				break
			default:
				break
		}
	} catch (error) {
		console.error("Clerk webhook sync failed", error)

		return NextResponse.json(
			{ error: "Clerk webhook sync failed." },
			{ status: 500 },
		)
	}

	return NextResponse.json({ received: true }, { status: 200 })
}
