/**
 * Taxonomy honesty invariants — the heart of the engine's truthfulness:
 *
 *  - REAL EVENTS ONLY: intents derive from persisted event rows handed in;
 *    unknown event types and unmapped statuses expand to NOTHING.
 *  - DIRECTION: each type notifies exactly the right side (host vs seeker),
 *    and the acting user is never notified about their own action.
 *  - SAME-HUMAN GUARD: when one person is on both sides, nothing is sent.
 *  - MESSAGE PRIVACY: message intents never carry thread content and are
 *    thread-collapsible.
 *  - CLAIMS: a submitted claim notification never implies approval (pinned
 *    at the copy level in notification-render.test.ts; here we pin the type
 *    and recipient).
 */
import { describe, expect, it } from "vitest";

import {
	expandEvent,
	seekerTypeForApplicationStatus,
	type DomainEventRow,
	type TaxonomyResolvers,
} from "../../services/notifications/taxonomy";

const BASE_EVENT: DomainEventRow = {
	id: "evt-1",
	event_type: "application_submitted",
	actor_scope: "seeker",
	subject_type: "application",
	subject_id: "app-1",
	listing_id: "listing-1",
	host_profile_id: null,
	seeker_profile_id: "seeker-prof-1",
	properties: {},
	occurred_at: "2026-07-14T12:00:00.000Z",
};

function makeResolvers(overrides: Partial<TaxonomyResolvers> = {}): TaxonomyResolvers {
	return {
		seekerClerkId: async (id) => (id === "seeker-prof-1" ? "clerk_seeker" : null),
		hostClerkId: async (id) => (id === "host-prof-1" ? "clerk_host" : null),
		listingContext: async (id) =>
			id === "listing-1" ? { title: "Salmon Season Deckhand", hostProfileId: "host-prof-1" } : null,
		conversationContext: async (id) =>
			id === "convo-1"
				? { seekerProfileId: "seeker-prof-1", hostProfileId: "host-prof-1", listingId: "listing-1" }
				: null,
		applicationContext: async (id) =>
			id === "app-1" ? { seekerProfileId: "seeker-prof-1", listingId: "listing-1" } : null,
		...overrides,
	};
}

describe("status → seeker notification type mapping (real 007 statuses)", () => {
	it("maps only charter-taxonomy statuses and nothing else", () => {
		expect(seekerTypeForApplicationStatus("reviewing")).toBe("application_viewed");
		expect(seekerTypeForApplicationStatus("saved_by_host")).toBe("application_shortlisted");
		expect(seekerTypeForApplicationStatus("offered")).toBe("application_offered");
		expect(seekerTypeForApplicationStatus("not_selected")).toBe("application_rejected");
		// Not in the charter taxonomy → no invented notifications.
		for (const status of ["accepted", "active", "completed", "expired", "applied", "withdrawn", "bogus", ""]) {
			expect(seekerTypeForApplicationStatus(status)).toBeNull();
		}
	});
});

describe("expandEvent — direction and recipients", () => {
	it("application_submitted notifies the HOST, never the applicant", async () => {
		const intents = await expandEvent(BASE_EVENT, makeResolvers());
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("application_received");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
		expect(intents[0].destinationPath).toBe("/host/applicants/app-1");
		expect(intents[0].values.listingTitle).toBe("Salmon Season Deckhand");
	});

	it("application_withdrawn notifies the HOST", async () => {
		const intents = await expandEvent(
			{ ...BASE_EVENT, event_type: "application_withdrawn" },
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("application_withdrawn");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
	});

	it("application_status_changed(offered) notifies the SEEKER in offers_invites", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "application_status_changed",
				actor_scope: "host",
				properties: { status: "offered" },
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("application_offered");
		expect(intents[0].category).toBe("offers_invites");
		expect(intents[0].recipientClerkUserId).toBe("clerk_seeker");
		expect(intents[0].destinationPath).toBe("/offered");
	});

	it("application_status_changed with unmapped status expands to NOTHING", async () => {
		for (const status of ["accepted", "active", "garbage"]) {
			const intents = await expandEvent(
				{
					...BASE_EVENT,
					event_type: "application_status_changed",
					properties: { status },
				},
				makeResolvers(),
			);
			expect(intents).toEqual([]);
		}
	});

	it("seeker-actor accepted notifies the HOST as offer_accepted", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "application_status_changed",
				properties: { status: "accepted", actor: "seeker" },
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("offer_accepted");
		expect(intents[0].category).toBe("offers_invites");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
		expect(intents[0].destinationPath).toBe("/host/applicants/app-1");
	});

	it("seeker-actor status other than accepted expands to NOTHING (decline travels as withdrawn)", async () => {
		for (const status of ["offered", "withdrawn", "not_selected", "garbage"]) {
			const intents = await expandEvent(
				{
					...BASE_EVENT,
					event_type: "application_status_changed",
					properties: { status, actor: "seeker" },
				},
				makeResolvers(),
			);
			expect(intents).toEqual([]);
		}
	});

	it("application_withdrawn with seeker_declined_offer reason notifies the HOST as offer_declined", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "application_withdrawn",
				properties: { reason: "seeker_declined_offer" },
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("offer_declined");
		expect(intents[0].category).toBe("offers_invites");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
		expect(intents[0].destinationPath).toBe("/host/applicants/app-1");
	});

	it("invite_created notifies the SEEKER and collapses created/sent duplicates", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "invite_created",
				subject_type: "invite",
				subject_id: "invite-1",
				host_profile_id: "host-prof-1",
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("invite_received");
		expect(intents[0].recipientClerkUserId).toBe("clerk_seeker");
		expect(intents[0].collapseKey).toBe("invite:invite-1");
	});

	it("match_generated notifies the SEEKER with the listing destination", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "match_generated",
				subject_type: "listing",
				subject_id: "listing-1",
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("new_strong_match");
		expect(intents[0].recipientClerkUserId).toBe("clerk_seeker");
		expect(intents[0].destinationPath).toBe("/listing/listing-1");
	});

	it("listing_claim_initiated notifies the CLAIMANT with the pending-review type", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "listing_claim_initiated",
				actor_scope: "host",
				host_profile_id: "host-prof-1",
				seeker_profile_id: null,
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("sourced_listing_claim_submitted");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
		expect(intents[0].destinationPath).toBe("/claim/listing-1");
	});
});

describe("expandEvent — self-action and same-human guards", () => {
	it("never notifies when the same human is on both sides", async () => {
		const sameHuman = makeResolvers({
			seekerClerkId: async () => "clerk_same",
			hostClerkId: async () => "clerk_same",
		});
		for (const event_type of [
			"application_submitted",
			"application_withdrawn",
			"application_status_changed",
		]) {
			const intents = await expandEvent(
				{
					...BASE_EVENT,
					event_type,
					properties: { status: "offered" },
				},
				sameHuman,
			);
			expect(intents).toEqual([]);
		}
	});

	it("message_sent notifies ONLY the counterparty and drops same-human threads", async () => {
		const event: DomainEventRow = {
			...BASE_EVENT,
			event_type: "message_sent",
			subject_type: "conversation",
			subject_id: "convo-1",
			properties: { sender_role: "seeker" },
		};
		const intents = await expandEvent(event, makeResolvers());
		expect(intents).toHaveLength(1);
		expect(intents[0].type).toBe("message_received");
		expect(intents[0].recipientClerkUserId).toBe("clerk_host");
		expect(intents[0].destinationPath).toBe("/host/messages/convo-1");
		expect(intents[0].collapseKey).toBe("conversation:convo-1");

		// Reverse direction.
		const reverse = await expandEvent(
			{ ...event, properties: { sender_role: "host" } },
			makeResolvers(),
		);
		expect(reverse[0].recipientClerkUserId).toBe("clerk_seeker");
		expect(reverse[0].destinationPath).toBe("/messages/convo-1");

		// Same human both sides → nothing.
		const sameHuman = await expandEvent(
			event,
			makeResolvers({
				seekerClerkId: async () => "clerk_same",
				hostClerkId: async () => "clerk_same",
			}),
		);
		expect(sameHuman).toEqual([]);
	});

	it("message intents NEVER carry message content", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "message_sent",
				subject_type: "conversation",
				subject_id: "convo-1",
				properties: { sender_role: "seeker", body: "SECRET thread text" },
			},
			makeResolvers(),
		);
		expect(intents).toHaveLength(1);
		expect(JSON.stringify(intents[0].values)).not.toContain("SECRET");
		expect(intents[0].titleKey).toContain("message_received");
	});

	it("message_sent with an invalid sender_role expands to NOTHING", async () => {
		const intents = await expandEvent(
			{
				...BASE_EVENT,
				event_type: "message_sent",
				subject_type: "conversation",
				subject_id: "convo-1",
				properties: { sender_role: "admin" },
			},
			makeResolvers(),
		);
		expect(intents).toEqual([]);
	});
});

describe("expandEvent — real-events-only fallbacks", () => {
	it("unknown event types expand to NOTHING (never a guessed notification)", async () => {
		for (const event_type of ["listing_created", "boost_purchased", "unknown_thing", ""]) {
			expect(await expandEvent({ ...BASE_EVENT, event_type }, makeResolvers())).toEqual([]);
		}
	});

	it("unresolvable recipients drop the intent instead of misaddressing it", async () => {
		const noHost = makeResolvers({ hostClerkId: async () => null });
		expect(await expandEvent(BASE_EVENT, noHost)).toEqual([]);
	});

	it("every produced intent is anchored to the source event id", async () => {
		const intents = await expandEvent(BASE_EVENT, makeResolvers());
		expect(intents[0].sourceEventId).toBe("evt-1");
		expect(intents[0].sourceOccurredAt).toBe("2026-07-14T12:00:00.000Z");
	});
});
