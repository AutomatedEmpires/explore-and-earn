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
 *   - user.created  -> ensures rows in users_profile_shadow + seeker_profiles,
 *                      then sends a best-effort welcome email (seeker or host)
 *   - user.updated  -> repairs missing profile rows, then updates cached email
 *   - user.deleted  -> soft-deletes (sets deleted_at) on users_profile_shadow
 *
 * Requests are verified with Svix using the svix-id / svix-timestamp /
 * svix-signature headers. Writes use the Supabase service-role key
 * (server-side only) and therefore bypass RLS.
 */
import type {
	ClerkUserPayload,
	ClerkWebhookEvent,
} from "@explore-and-earn/contracts"
import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Webhook } from "svix"

import { absoluteUrl, sendEmail } from "../../../../lib/email"
import { welcomeHostEmail, welcomeSeekerEmail } from "../../../../lib/emails"

export const runtime = "nodejs"

const UNIQUE_VIOLATION = "23505"

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

/**
 * Best-effort welcome email on user.created. Picks the seeker vs host template
 * from Clerk public_metadata.role. The transport (sendEmail) already swallows
 * its own errors; this only guards the role/email plumbing and never throws.
 */
async function sendWelcomeEmail(user: ClerkUserPayload): Promise<void> {
	const email = primaryEmailForUser(user)
	if (!email) return
	// Two concurrent Svix deliveries can each win one of the two profile
	// inserts. Use one stable provider-side key so Resend accepts at most one
	// welcome across workers even when both deliveries reach this function.
	const idempotencyKey = `clerk:user.created:${user.id}:welcome`

	const role =
		typeof user.public_metadata?.role === "string"
			? user.public_metadata.role
			: null
	const firstName =
		typeof user.first_name === "string" && user.first_name.trim().length > 0
			? user.first_name.trim()
			: null

	if (role === "host") {
		await sendEmail({
			to: email,
			subject: "Your host account is ready",
			html: welcomeHostEmail({
				name: firstName,
				createListingUrl: absoluteUrl("/host"),
			}),
			template: "welcomeHost",
			idempotencyKey,
		})
		return
	}

	await sendEmail({
		to: email,
		subject: "Welcome to Explore & Earn",
		html: welcomeSeekerEmail({
			name: firstName,
			exploreUrl: absoluteUrl("/swipe"),
		}),
		template: "welcomeSeeker",
		idempotencyKey,
	})
}

async function ensureUserRows(user: ClerkUserPayload): Promise<boolean> {
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

	if (shadowError && shadowError.code !== UNIQUE_VIOLATION) {
		throw shadowError
	}
	const shadowCreated = shadowError === null

	const { error: seekerError } = await supabase.from("seeker_profiles").insert({
		clerk_user_id: user.id,
	})

	if (seekerError && seekerError.code !== UNIQUE_VIOLATION) {
		throw seekerError
	}

	// Svix retries and concurrent deliveries are normal. A duplicate in one
	// table must not prevent repairing a missing row in the other. Only the
	// delivery that inserted at least one row owns the best-effort welcome send.
	return shadowCreated || seekerError === null
}

async function syncUserUpdated(user: ClerkUserPayload): Promise<void> {
	if (!user.id) {
		throw new Error("Clerk user.updated payload is missing data.id.")
	}

	// An older or out-of-order delivery can leave Clerk authoritative while one
	// or both database rows are absent. Repair the same idempotent pair as
	// user.created, but never send a welcome from an update event.
	await ensureUserRows(user)

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
				if (await ensureUserRows(event.data)) {
					try {
						await sendWelcomeEmail(event.data)
					} catch (welcomeError) {
						console.error(
							"Clerk welcome email failed (non-fatal)",
							welcomeError,
						)
					}
				}
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
