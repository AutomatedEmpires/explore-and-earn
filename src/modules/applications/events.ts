// The `application.submitted` subscriber: records an `apply` listing event in SP3 (SP4 spec 6;
// plan Task 21). The dedupe key makes a retried job count one apply, on the day it was sent.
import { recordListingEvent } from '@/modules/discovery';
import { readEnvelope, type HandlerMap } from '@/modules/jobs';

export const LISTING_EVENT_TOPIC = 'applications.listing_event';

export const eventHandlers: HandlerMap = {
  [LISTING_EVENT_TOPIC]: async (payload, { db }) => {
    const { data } = readEnvelope(payload, 'application.submitted');
    await recordListingEvent(db, {
      listingId: data.listingId,
      type: 'apply',
      source: data.source,
      // When the seeker applied, not when the job ran: a delayed or retried job still counts
      // the application on its own day.
      at: new Date(data.submittedAt),
      dedupeKey: `apply:${data.applicationId}`,
    });
  },
};
