// Event → notification-intent expansion: the ONLY place a domain event may
// become user-facing notifications. Pure decision logic — all data access
// goes through injected resolvers so the mapping is testable without a DB.
//
// HONESTY INVARIANTS enforced here:
//   * every intent derives from a persisted events row that the dispatcher
//     hands in (fabricating engagement is structurally impossible — there is
//     no code path from "no event" to "intent");
//   * the acting user is never notified about their own action (recipients
//     are always the counterparty by construction, with a same-user guard);
//   * unknown event types / unknown statuses expand to NOTHING — never to a
//     guessed notification.

import {
	NOTIFICATION_TYPE_CATEGORY,
	URGENT_NOTIFICATION_TYPES,
	type NotificationIntent,
	type NotificationType,
} from "@explore-and-earn/contracts"

/** Persisted events-table row (migration 008), as the dispatcher reads it. */
export interface DomainEventRow {
	readonly id: string
	readonly event_type: string
	readonly actor_scope: string | null
	readonly subject_type: string | null
	readonly subject_id: string | null
	readonly listing_id: string | null
	readonly host_profile_id: string | null
	readonly seeker_profile_id: string | null
	readonly properties: Record<string, unknown> | null
	readonly occurred_at: string
}

/** Locale is stamped later (from recipient prefs) by the dispatcher. */
export type PreIntent = Omit<NotificationIntent, "locale">

/**
 * Authoritative lookups the taxonomy needs. Implementations must read REAL
 * rows (service role) — resolvers returning null cause the intent to be
 * dropped, never guessed.
 */
export interface TaxonomyResolvers {
	seekerClerkId(seekerProfileId: string): Promise<string | null>
	hostClerkId(hostProfileId: string): Promise<string | null>
	listingContext(
		listingId: string,
	): Promise<{ readonly title: string; readonly hostProfileId: string | null } | null>
	conversationContext(conversationId: string): Promise<{
		readonly seekerProfileId: string | null
		readonly hostProfileId: string | null
		readonly listingId: string | null
	} | null>
	applicationContext(applicationId: string): Promise<{
		readonly seekerProfileId: string | null
		readonly listingId: string | null
	} | null>
	/**
	 * Claim context for the claim-to-verify lifecycle (claim id → claimant +
	 * listing). OPTIONAL so existing resolver constructions keep compiling;
	 * when absent the taxonomy falls back to the service-role read in
	 * @explore-and-earn/db (see {@link resolveClaimContext}).
	 */
	claimContext?(claimId: string): Promise<ClaimTaxonomyContext | null>
}

export interface ClaimTaxonomyContext {
	readonly claimantClerkUserId: string
	readonly listingId: string
	readonly hostProfileId: string | null
}

/**
 * Claim lookups go through the injected resolver when provided (tests), and
 * otherwise fall back to the real service-role read. The import is dynamic so
 * this module stays importable in pure unit tests (no "server-only" pull-in).
 */
async function resolveClaimContext(
	resolvers: TaxonomyResolvers,
	claimId: string,
): Promise<ClaimTaxonomyContext | null> {
	if (resolvers.claimContext) return resolvers.claimContext(claimId)
	const { adminClaimContext } = await import("@explore-and-earn/db")
	const ctx = await adminClaimContext(claimId)
	return ctx
		? {
				claimantClerkUserId: ctx.claimantClerkUserId,
				listingId: ctx.listingId,
				hostProfileId: ctx.hostProfileId,
			}
		: null
}

function keysFor(type: NotificationType): { titleKey: string; bodyKey: string } {
	return {
		titleKey: `Notifications.types.${type}.title`,
		bodyKey: `Notifications.types.${type}.body`,
	}
}

function makeIntent(args: {
	readonly event: DomainEventRow
	readonly type: NotificationType
	readonly recipientClerkUserId: string
	readonly destinationPath: string
	readonly values: Readonly<Record<string, string | number>>
	readonly variant?: string
	/**
	 * Message keys for a variant whose copy differs materially from the type's
	 * default (e.g. "they accepted your invite" vs "someone applied"). A variant
	 * that reuses the default copy would be a distinction the recipient cannot
	 * see — if you set one, give it real copy.
	 */
	readonly keys?: { readonly titleKey: string; readonly bodyKey: string }
	readonly entity?: { readonly type: string; readonly id: string }
	readonly collapseKey?: string
	readonly expiresAt?: string
}): PreIntent {
	return {
		sourceEventId: args.event.id,
		sourceOccurredAt: args.event.occurred_at,
		recipientClerkUserId: args.recipientClerkUserId,
		category: NOTIFICATION_TYPE_CATEGORY[args.type],
		type: args.type,
		variant: args.variant ?? "default",
		destinationPath: args.destinationPath,
		...(args.keys ?? keysFor(args.type)),
		values: args.values,
		...(args.entity ? { entity: args.entity } : {}),
		...(args.collapseKey ? { collapseKey: args.collapseKey } : {}),
		...(args.expiresAt ? { expiresAt: args.expiresAt } : {}),
		urgent: (URGENT_NOTIFICATION_TYPES as readonly string[]).includes(args.type),
	}
}

function prop(event: DomainEventRow, key: string): string | null {
	const v = event.properties?.[key]
	return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * application_status_changed → seeker-facing type, or null for statuses that
 * are not seeker notifications (unknown/none → nothing, never a guess).
 */
export function seekerTypeForApplicationStatus(status: string): NotificationType | null {
	// Real application statuses (007 CHECK): applied, reviewing, saved_by_host,
	// offered, accepted, active, completed, not_selected, withdrawn, expired.
	switch (status) {
		case "reviewing":
			// The host actually opened/started reviewing — the honest "viewed".
			return "application_viewed"
		case "saved_by_host":
			return "application_shortlisted"
		case "offered":
			return "application_offered"
		case "not_selected":
			return "application_rejected"
		default:
			// accepted/active/completed etc. are not in the charter taxonomy —
			// no notification rather than an invented one.
			return null
	}
}

/** Application-lifecycle context shared by several expansions. */
async function applicationParties(
	event: DomainEventRow,
	resolvers: TaxonomyResolvers,
): Promise<{
	applicationId: string | null
	listingTitle: string
	listingId: string | null
	seekerClerk: string | null
	hostClerk: string | null
} | null> {
	const applicationId = event.subject_type === "application" ? event.subject_id : null
	let seekerProfileId = event.seeker_profile_id
	let listingId = event.listing_id
	if ((!seekerProfileId || !listingId) && applicationId) {
		const app = await resolvers.applicationContext(applicationId)
		seekerProfileId = seekerProfileId ?? app?.seekerProfileId ?? null
		listingId = listingId ?? app?.listingId ?? null
	}
	const listing = listingId ? await resolvers.listingContext(listingId) : null
	const hostProfileId = event.host_profile_id ?? listing?.hostProfileId ?? null
	const [seekerClerk, hostClerk] = await Promise.all([
		seekerProfileId ? resolvers.seekerClerkId(seekerProfileId) : Promise.resolve(null),
		hostProfileId ? resolvers.hostClerkId(hostProfileId) : Promise.resolve(null),
	])
	return {
		applicationId,
		listingTitle: listing?.title ?? "",
		listingId,
		seekerClerk,
		hostClerk,
	}
}

/**
 * Expand one persisted domain event into notification intents. Events with
 * no notification meaning return [] — the dispatcher still watermarks them.
 */
export async function expandEvent(
	event: DomainEventRow,
	resolvers: TaxonomyResolvers,
): Promise<PreIntent[]> {
	switch (event.event_type) {
		/* ------------------------------------------------ application lifecycle */
		case "application_submitted": {
			const ctx = await applicationParties(event, resolvers)
			// Host is notified someone applied; never the applicant themself.
			if (!ctx?.hostClerk || ctx.hostClerk === ctx.seekerClerk) return []
			// An application created by ACCEPTING the host's own invite is a
			// materially different message ("they accepted your invite") than a
			// cold application — same event, honest variant-specific copy.
			const fromInvite = prop(event, "source") === "invite"
			return [
				makeIntent({
					event,
					type: "application_received",
					variant: fromInvite ? "invite_accepted" : "default",
					...(fromInvite
						? {
								keys: {
									titleKey: "Notifications.types.application_received.invite_accepted.title",
									bodyKey: "Notifications.types.application_received.invite_accepted.body",
								},
							}
						: {}),
					recipientClerkUserId: ctx.hostClerk,
					destinationPath: ctx.applicationId
						? `/host/applicants/${ctx.applicationId}`
						: "/host/applicants",
					values: { listingTitle: ctx.listingTitle },
					entity: ctx.applicationId
						? { type: "application", id: ctx.applicationId }
						: undefined,
				}),
			]
		}
		case "application_viewed_by_host": {
			const ctx = await applicationParties(event, resolvers)
			if (!ctx?.seekerClerk || ctx.seekerClerk === ctx.hostClerk) return []
			return [
				makeIntent({
					event,
					type: "application_viewed",
					recipientClerkUserId: ctx.seekerClerk,
					destinationPath: ctx.applicationId ? `/applied/${ctx.applicationId}` : "/applied",
					values: { listingTitle: ctx.listingTitle },
					entity: ctx.applicationId
						? { type: "application", id: ctx.applicationId }
						: undefined,
					// A burst of host views of the same application collapses.
					collapseKey: ctx.applicationId ? `application_viewed:${ctx.applicationId}` : undefined,
				}),
			]
		}
		case "application_status_changed": {
			const status = prop(event, "status")
			// SEEKER-actor transitions notify the HOST (the counterparty), never
			// the seeker about their own action. Today that is exactly one case:
			// the seeker accepting an offer. (Decline travels as
			// application_withdrawn with reason='seeker_declined_offer' below.)
			if (prop(event, "actor") === "seeker") {
				if (status !== "accepted") return []
				const ctx = await applicationParties(event, resolvers)
				if (!ctx?.hostClerk || ctx.hostClerk === ctx.seekerClerk) return []
				return [
					makeIntent({
						event,
						type: "offer_accepted",
						recipientClerkUserId: ctx.hostClerk,
						destinationPath: ctx.applicationId
							? `/host/applicants/${ctx.applicationId}`
							: "/host/applicants",
						values: { listingTitle: ctx.listingTitle },
						entity: ctx.applicationId
							? { type: "application", id: ctx.applicationId }
							: undefined,
					}),
				]
			}
			const type = status ? seekerTypeForApplicationStatus(status) : null
			if (!type) return []
			const ctx = await applicationParties(event, resolvers)
			if (!ctx?.seekerClerk || ctx.seekerClerk === ctx.hostClerk) return []
			const destinationPath =
				type === "application_offered"
					? "/offered"
					: ctx.applicationId
						? `/applied/${ctx.applicationId}`
						: "/applied"
			// The live offer flow IS applications.status='offered' (the offers
			// table is dormant): an offer with a real expires_at also seeds the
			// offer-expiring reminder path (schedule-derived, re-checked at send).
			return [
				makeIntent({
					event,
					type,
					recipientClerkUserId: ctx.seekerClerk,
					destinationPath,
					values: { listingTitle: ctx.listingTitle },
					entity: ctx.applicationId
						? { type: "application", id: ctx.applicationId }
						: undefined,
					// Repeated back-and-forth status flips on one application
					// collapse to the latest state rather than stacking — EXCEPT
					// an offer, which must never silently replace (and be masked
					// by) an unread routine status notification.
					collapseKey: ctx.applicationId
						? type === "application_offered"
							? `application_offered:${ctx.applicationId}`
							: `application_status:${ctx.applicationId}`
						: undefined,
				}),
			]
		}
		case "application_not_selected": {
			const ctx = await applicationParties(event, resolvers)
			if (!ctx?.seekerClerk || ctx.seekerClerk === ctx.hostClerk) return []
			return [
				makeIntent({
					event,
					type: "application_rejected",
					recipientClerkUserId: ctx.seekerClerk,
					destinationPath: ctx.applicationId ? `/applied/${ctx.applicationId}` : "/applied",
					values: { listingTitle: ctx.listingTitle },
					entity: ctx.applicationId
						? { type: "application", id: ctx.applicationId }
						: undefined,
				}),
			]
		}
		case "application_withdrawn": {
			const ctx = await applicationParties(event, resolvers)
			if (!ctx?.hostClerk || ctx.hostClerk === ctx.seekerClerk) return []
			// A withdrawal that is actually a declined offer gets its own honest
			// copy ("declined your offer") instead of the generic withdrawal.
			const declined = prop(event, "reason") === "seeker_declined_offer"
			return [
				makeIntent({
					event,
					type: declined ? "offer_declined" : "application_withdrawn",
					recipientClerkUserId: ctx.hostClerk,
					destinationPath: ctx.applicationId
						? `/host/applicants/${ctx.applicationId}`
						: "/host/applicants",
					values: { listingTitle: ctx.listingTitle },
					entity: ctx.applicationId
						? { type: "application", id: ctx.applicationId }
						: undefined,
				}),
			]
		}

		/* ------------------------------------------------------------- matching */
		case "match_generated": {
			if (!event.seeker_profile_id || !event.listing_id) return []
			const [seekerClerk, listing] = await Promise.all([
				resolvers.seekerClerkId(event.seeker_profile_id),
				resolvers.listingContext(event.listing_id),
			])
			if (!seekerClerk || !listing) return []
			return [
				makeIntent({
					event,
					type: "new_strong_match",
					recipientClerkUserId: seekerClerk,
					destinationPath: `/listing/${event.listing_id}`,
					values: { listingTitle: listing.title },
					entity: { type: "listing", id: event.listing_id },
				}),
			]
		}

		/* -------------------------------------------------- invitations & offers */
		case "invite_created":
		case "invite_sent": {
			if (!event.seeker_profile_id) return []
			const [seekerClerk, listing] = await Promise.all([
				resolvers.seekerClerkId(event.seeker_profile_id),
				event.listing_id
					? resolvers.listingContext(event.listing_id)
					: Promise.resolve(null),
			])
			if (!seekerClerk) return []
			return [
				makeIntent({
					event,
					type: "invite_received",
					recipientClerkUserId: seekerClerk,
					destinationPath: "/invites",
					values: { listingTitle: listing?.title ?? "" },
					entity: event.subject_id
						? { type: "invite", id: event.subject_id }
						: undefined,
					// Duplicate producer instrumentation (created+sent) collapses to
					// one logical notification per invite.
					collapseKey: event.subject_id ? `invite:${event.subject_id}` : undefined,
				}),
			]
		}
		case "offer_created":
		case "offer_sent": {
			const ctx = await applicationParties(event, resolvers)
			if (!ctx?.seekerClerk || ctx.seekerClerk === ctx.hostClerk) return []
			return [
				makeIntent({
					event,
					type: "offer_received",
					recipientClerkUserId: ctx.seekerClerk,
					destinationPath: "/offered",
					values: { listingTitle: ctx.listingTitle },
					entity: event.subject_id ? { type: "offer", id: event.subject_id } : undefined,
					collapseKey: event.subject_id ? `offer:${event.subject_id}` : undefined,
				}),
			]
		}

		/* ------------------------------------------------------------ messaging */
		case "message_sent": {
			const conversationId =
				event.subject_type === "conversation" ? event.subject_id : null
			if (!conversationId) return []
			const senderRole = prop(event, "sender_role")
			if (senderRole !== "seeker" && senderRole !== "host") return []
			const convo = await resolvers.conversationContext(conversationId)
			if (!convo) return []
			// Recipient is the OTHER side — the sender is never notified.
			const recipientRole = senderRole === "seeker" ? "host" : "seeker"
			const recipientProfileId =
				recipientRole === "host" ? convo.hostProfileId : convo.seekerProfileId
			const senderProfileId =
				senderRole === "host" ? convo.hostProfileId : convo.seekerProfileId
			if (!recipientProfileId || !senderProfileId) return []
			const [recipientClerk, senderClerk, listing] = await Promise.all([
				recipientRole === "host"
					? resolvers.hostClerkId(recipientProfileId)
					: resolvers.seekerClerkId(recipientProfileId),
				senderRole === "host"
					? resolvers.hostClerkId(senderProfileId)
					: resolvers.seekerClerkId(senderProfileId),
				convo.listingId ? resolvers.listingContext(convo.listingId) : Promise.resolve(null),
			])
			// Same-human guard (one person on both sides of a thread).
			if (!recipientClerk || recipientClerk === senderClerk) return []
			return [
				makeIntent({
					event,
					type: "message_received",
					recipientClerkUserId: recipientClerk,
					destinationPath:
						recipientRole === "host"
							? `/host/messages/${conversationId}`
							: `/messages/${conversationId}`,
					// Message CONTENT is never placed in an intent: push payloads and
					// email bodies must not carry private thread text.
					values: { listingTitle: listing?.title ?? "" },
					entity: { type: "conversation", id: conversationId },
					// Thread-aware collapse: a burst in one thread → one notification.
					collapseKey: `conversation:${conversationId}`,
				}),
			]
		}

		/* -------------------------------------------- sourced claim lifecycle */
		case "listing_claim_initiated": {
			// A SOURCED listing has NO host — the review alert goes to the
			// founder/admin (the same allow-list identity the admin gate uses).
			// No admin configured → no intent, never a misaddressed one.
			const adminClerk = (process.env.ADMIN_CLERK_USER_ID ?? "").trim()
			if (!adminClerk) return []
			const claimId = event.subject_type === "listing_claim" ? event.subject_id : null
			if (!claimId) return []
			const claim = await resolveClaimContext(resolvers, claimId)
			// Self-action guard: an admin claiming a listing themself gets no
			// "review this" alert about their own submission.
			if (!claim || claim.claimantClerkUserId === adminClerk) return []
			// Same listing-id fallback as the decision events below: the claim
			// context is authoritative when a recorder omits event.listing_id.
			const listingId = event.listing_id ?? claim.listingId
			const listing = listingId ? await resolvers.listingContext(listingId) : null
			return [
				makeIntent({
					event,
					type: "sourced_listing_claim_submitted",
					recipientClerkUserId: adminClerk,
					destinationPath: "/admin/claims",
					values: { listingTitle: listing?.title ?? "" },
					entity: { type: "listing_claim", id: claimId },
				}),
			]
		}
		case "listing_claim_approved":
		case "listing_claim_rejected": {
			// Founder decided — tell the CLAIMANT (the counterparty of the admin
			// action). The copy states the decision plainly; approval never claims
			// the listing changed (confirmation is still ahead).
			const claimId = event.subject_type === "listing_claim" ? event.subject_id : null
			if (!claimId) return []
			const claim = await resolveClaimContext(resolvers, claimId)
			if (!claim) return []
			const listingId = event.listing_id ?? claim.listingId
			const listing = listingId ? await resolvers.listingContext(listingId) : null
			return [
				makeIntent({
					event,
					type:
						event.event_type === "listing_claim_approved"
							? "listing_claim_approved"
							: "listing_claim_rejected",
					recipientClerkUserId: claim.claimantClerkUserId,
					destinationPath: listingId ? `/claim/${listingId}` : "/",
					values: { listingTitle: listing?.title ?? "" },
					entity: { type: "listing_claim", id: claimId },
					// One claim gets exactly one decision; a re-dispatched event
					// collapses instead of stacking.
					collapseKey: `claim_decision:${claimId}`,
				}),
			]
		}
		case "listing_claim_converted": {
			// Deliberate RECEIPT to the claimant (they performed the conversion):
			// the sourced→verified switch is consequential and async surfaces
			// (email) confirm it landed. This is the one intent where recipient ==
			// actor by design.
			const claimId = event.subject_type === "listing_claim" ? event.subject_id : null
			if (!claimId) return []
			const claim = await resolveClaimContext(resolvers, claimId)
			if (!claim) return []
			const listingId = event.listing_id ?? claim.listingId
			const listing = listingId ? await resolvers.listingContext(listingId) : null
			return [
				makeIntent({
					event,
					type: "listing_claim_converted",
					recipientClerkUserId: claim.claimantClerkUserId,
					destinationPath: "/host/listings",
					values: { listingTitle: listing?.title ?? "" },
					entity: { type: "listing_claim", id: claimId },
					collapseKey: `claim_converted:${claimId}`,
				}),
			]
		}

		default:
			return []
	}
}
