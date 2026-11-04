// Domain events and who listens to them (SP2 spec section 3). `emit()` (@/modules/jobs) writes
// one outbox row per subscriber topic listed here, inside the emitter's transaction, so reverse
// flows between modules never need an import. Shared touchpoint: later sub-projects add their
// events to EventPayloads and append their topics to the lists below.

export interface EventPayloads {
  'listing.published': { listingId: string; revisionId: string; orgId: string; first: boolean };
  'listing.changed': { listingId: string; revisionId: string; orgId: string };
  'listing.closed': {
    listingId: string;
    orgId: string;
    revisionId?: string;
    reason: 'host' | 'end_date' | 'downgrade' | 'lapsed' | 'org_suspended';
  };
  'listing.removed': { listingId: string; orgId: string; reason?: string };
  'org.status_changed': { orgId: string; status: 'active' | 'suspended' | 'banned' };
  'org.member_removed': { orgId: string; userId: string; reassignToUserId: string };
  'location.updated': { locationId: string; orgId: string };
  'hostpage.updated': { orgId: string };
  'subscription.changed': {
    orgId: string;
    status: string;
    plan: 'starter' | 'professional' | 'enterprise' | null;
  };
  'verification.decided': {
    orgId: string;
    status: 'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';
  };
  'billing.stripe_event': { eventId: string; type: string; objectId: string | null };
}

/** The outbox topics each event fans out to. Every topic needs a handler in job-handlers.ts. */
export const eventSubscribers: Record<keyof EventPayloads, string[]> = {
  // Only a first publish notifies; the handler checks `first`.
  'listing.published': ['hostpages.notify_followers'],
  // SP3 projects these into search.
  'listing.changed': [],
  'listing.closed': [],
  'listing.removed': [],
  'org.status_changed': ['listings.close_for_org'],
  // SP5 moves the member's threads and interviews.
  'org.member_removed': [],
  'location.updated': ['locations.resolve_nws_grid'],
  'hostpage.updated': [],
  'subscription.changed': ['listings.enforce_slot_limit', 'hostpages.mark_public'],
  'verification.decided': ['listings.resume_screening'],
  // SP6 subscribes for one-time payments.
  'billing.stripe_event': [],
};
