// Public API of the hostpages module: host page content, the public read model, follows and
// provider hooks (SP2 spec sections 3 and 8.5). Imports orgs, locations, billing and listings.
import type { DbOrTx } from '@/lib/db';
import { readEnvelope, type HandlerMap } from '@/modules/jobs';
import { checkHostPageContent } from './check';
import { CHECK_TOPIC, isEntitledStatus, markPublic } from './editor';
// Module-load registrations: notification types and the host_page subject handlers.
import './notifications';
import './subjects';

export { HostPageContentSchema, SOCIAL_KINDS, type HostPageContent } from './content';
export {
  emptyHostPage,
  getHostPageForEditor,
  saveHostPage,
  type HostPageForEditor,
  type HostPageStatus,
} from './editor';
export { HOST_PAGE_SUBJECT } from './check';

export type HostIdentity = {
  orgId: string;
  name: string;
  slug: string;
  logoMediaId: string | null;
  coverMediaId: string | null;
  subscriber: { hostSince: Date } | null;
  hiringNow: boolean;
  homeLocation: { city: string; state: string } | null;
};

export type Tally = { yes: number; partly: number; no: number };

/** A later sub-project's slot on the host page; a slot with no provider renders nothing. */
export type HostPageProvider =
  | {
      kind: 'reply_time';
      fn: (
        db: DbOrTx,
        orgId: string,
      ) => Promise<{ conversations: number; withinADay: boolean } | null>;
    }
  | {
      kind: 'as_described';
      fn: (
        db: DbOrTx,
        orgId: string,
      ) => Promise<{ responses: number; housing: Tally; meals: Tally; pay: Tally } | null>;
    }
  | {
      kind: 'pinned_announcement';
      fn: (
        db: DbOrTx,
        orgId: string,
      ) => Promise<
        {
          id: string;
          title: string;
          body: string;
          mediaId: string | null;
          endsAt: Date;
          ctaHref: string;
        }[]
      >;
    };

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W7)`);
}

/** SP3 cards and map previews. */
export async function getHostIdentities(
  _db: DbOrTx,
  _orgIds: string[],
): Promise<Map<string, HostIdentity>> {
  return notImplemented('getHostIdentities');
}

/** SP3 sitemaps. */
export async function listPublicHostSlugs(
  _db: DbOrTx,
  _i: { after?: string; limit: number },
): Promise<{ items: { slug: string; updatedAt: Date }[]; next: string | null }> {
  return notImplemented('listPublicHostSlugs');
}

/** SP4 calls this on mute or block. */
export async function unfollow(_db: DbOrTx, _userId: string, _orgId: string): Promise<void> {
  return notImplemented('unfollow');
}

export async function listFollowerIds(
  _db: DbOrTx,
  _orgId: string,
  _i: { after?: string; limit: number },
): Promise<{ userIds: string[]; next: string | null }> {
  return notImplemented('listFollowerIds');
}

const providers = new Map<HostPageProvider['kind'], HostPageProvider>();

/** SP5 registers `reply_time` and `as_described`; SP6 registers `pinned_announcement`. */
export function registerHostPageProvider(p: HostPageProvider): void {
  providers.set(p.kind, p);
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

const noop = async () => {};

export const jobHandlers: HandlerMap = {
  /** Enqueued by saveHostPage with `{ orgId }`. */
  [CHECK_TOPIC]: async (payload, { db }) => {
    const orgId = (payload as { orgId?: unknown } | null)?.orgId;
    if (typeof orgId !== 'string') throw new Error('hostpages.check_content: orgId is required');
    await checkHostPageContent(db, orgId);
  },
  'hostpages.notify_followers': noop,
  /** subscription.changed: the page is public from the first time the org is entitled. */
  'hostpages.mark_public': async (payload, { db, now }) => {
    const { data } = readEnvelope(payload, 'subscription.changed');
    if (isEntitledStatus(data.status)) await markPublic(db, data.orgId, now);
  },
};
