// The `application.submitted` subscriber: records an `apply` listing event in SP3 (SP4 spec 6).
// W0 stub: W4 implements it (Task 21). The stub handler is a no-op, so the subscribed topic
// never goes dead.
import type { HandlerMap } from '@/modules/jobs';

export const LISTING_EVENT_TOPIC = 'applications.listing_event';

export const eventHandlers: HandlerMap = {
  [LISTING_EVENT_TOPIC]: async () => {},
};
