/**
 * Clerk webhook handler.
 *
 * Production webhook URL pattern:
 *   https://<production-domain>/api/webhooks/clerk
 *   e.g. https://explore-and-earn.vercel.app/api/webhooks/clerk
 *        (or the custom production domain once it is configured)
 *
 * Setup: register this endpoint in the Clerk Dashboard -> Webhooks for the
 * PRODUCTION instance, and set CLERK_WEBHOOK_SECRET (the Svix signing secret)
 * in Vercel's Production environment.
 *
 * Handled Clerk events:
 *   - user.created  -> inserts rows into users_profile_shadow + seeker_profiles
 *   - user.updated  -> updates the cached email on users_profile_shadow
 *   - user.deleted  -> soft-deletes (sets deleted_at) on users_profile_shadow
 *
 * Requests are verified with Svix using the svix-id / svix-timestamp /
 * svix-signature headers. Writes use the Supabase service-role key
 * (server-side only) and therefore bypass RLS.
 */
import { createClient } from "@supabase/supabase-js"
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

function getSupabaseServiceRoleClient() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Missing Supabase service-role configuration for Clerk webhook writes.",
		)
	}

	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	})
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

async function syncUserCreated(user: ClerkUserPayload): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.created payload is missing data.id.")
	}

	const supabase = getSupabaseServiceRoleClient()
	const { error: shadowError } = await supabase
		.from("users_profile_shadow")
		.insert({
			clerk_user_id: user.id,
			email: primaryEmailForUser(user),
			created_at: createdAtForUser(user),
		})

	if (shadowError) {
		throw shadowError
	}

	const { error: seekerError } = await supabase.from("seeker_profiles").insert({
		clerk_user_id: user.id,
	})

	if (seekerError) {
		throw seekerError
	}
}

async function syncUserUpdated(user: ClerkUserPayload): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.updated payload is missing data.id.")
	}

	const supabase = getSupabaseServiceRoleClient()
	const { error } = await supabase
		.from("users_profile_shadow")
		.update({ email: primaryEmailForUser(user) })
		.eq("clerk_user_id", user.id)

	if (error) {
		throw error
	}
}

async function syncUserDeleted(user: ClerkUserPayload): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.deleted payload is missing data.id.")
	}

	const supabase = getSupabaseServiceRoleClient()
	const { error } = await supabase
		.from("users_profile_shadow")
		.update({ deleted_at: new Date().toISOString() })
		.eq("clerk_user_id", user.id)

	if (error) {
		throw error
	}
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
		switch (event.type) {
			case "user.created":
				await syncUserCreated(event.data)
				break
			case "user.updated":
				await syncUserUpdated(event.data)
				break
			case "user.deleted":
				await syncUserDeleted(event.data)
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
