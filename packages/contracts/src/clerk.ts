/** Clerk webhook payload contracts consumed by the server-side sync route. */
export type ClerkWebhookEventType =
	| "user.created"
	| "user.updated"
	| "user.deleted"

export interface ClerkEmailAddress {
	readonly id: string
	readonly email_address: string
}

export interface ClerkUserPayload {
	readonly id?: string
	readonly created_at?: number
	readonly email_addresses?: ReadonlyArray<ClerkEmailAddress>
	readonly primary_email_address_id?: string | null
	readonly first_name?: string | null
	readonly public_metadata?: { readonly role?: string | null } | null
}

export interface ClerkWebhookEvent {
	readonly type: ClerkWebhookEventType | string
	readonly data: ClerkUserPayload
}
