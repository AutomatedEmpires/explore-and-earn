// Public API of the hostpages module: host page content, the public read model, follows and
// provider hooks (SP2 spec sections 3 and 8.5). Imports orgs, locations, billing and listings.
import { readEnvelope, type HandlerMap } from '@/modules/jobs';
import { checkHostPageContent } from './check';
import { CHECK_TOPIC, isEntitledStatus, markPublic } from './editor';
import { NOTIFY_FOLLOWERS_TOPIC, notifyFollowersJob } from './follows';
// Module-load registrations: notification types, the host_page subject handlers and the
// weather org filter.
import './notifications';
import './subjects';
import './weather-scope';

export { HostPageContentSchema, SOCIAL_KINDS, type HostPageContent } from './content';
export {
  emptyHostPage,
  getHostPageForEditor,
  saveHostPage,
  type HostPageForEditor,
  type HostPageStatus,
} from './editor';
export { HOST_PAGE_SUBJECT } from './check';
export {
  AS_DESCRIBED_MIN_RESPONSES,
  FOLLOWERS_SHOWN_FROM,
  REPLY_TIME_MIN_CONVERSATIONS,
  getHostIdentities,
  listPublicHostSlugs,
  resolveHostPage,
  type HostIdentity,
  type HostPageJobGroup,
  type HostPagePublic,
  type ResolvedHostPage,
} from './public';
export {
  registerHostPageProvider,
  type HostPageProvider,
  type PinnedAnnouncement,
  type Tally,
} from './providers';
export { usuallyHires } from './usually-hires';
export {
  FOLLOWERS_PER_RUN,
  follow,
  listFollowerIds,
  listFollows,
  unfollow,
  unfollowHost,
} from './follows';
/** SP8 registers these with its privacy exporter and eraser. */
export { privacyHandlers } from './privacy';

export const jobHandlers: HandlerMap = {
  /** Enqueued by saveHostPage with `{ orgId }`. */
  [CHECK_TOPIC]: async (payload, { db }) => {
    const orgId = (payload as { orgId?: unknown } | null)?.orgId;
    if (typeof orgId !== 'string') throw new Error('hostpages.check_content: orgId is required');
    await checkHostPageContent(db, orgId);
  },
  /** listing.published (and its own next pages, with a cursor). */
  [NOTIFY_FOLLOWERS_TOPIC]: async (payload, { db }) => {
    await notifyFollowersJob(db, payload);
  },
  /** subscription.changed: the page is public from the first time the org is entitled. */
  'hostpages.mark_public': async (payload, { db, now }) => {
    const { data } = readEnvelope(payload, 'subscription.changed');
    if (isEntitledStatus(data.status)) await markPublic(db, data.orgId, now);
  },
};
