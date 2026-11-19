// Thread card payloads. Messaging stores the reference; this fills in what the viewer may see.
import { inArray } from 'drizzle-orm';
import { seekerStatus, type ApplicationStatus } from '@/lib/applications';
import type { DbOrTx } from '@/lib/db';
import type { CardPayload, HostInviteItem, SeekerInviteItem } from '@/lib/hiring';
import { getHostCards } from '@/modules/applications';
import { getHiringInfoMany } from '@/modules/listings';
import { inScope, listingScope, type ThreadCard, type ThreadViewer } from '@/modules/messaging';
import { hostInviteItems, seekerInviteItems } from './invites/reads';
import { interviewBundles, seekerInterviewViews } from './interviews/reads';
import { offerBundles, seekerOfferViews } from './offers/offers';
import { pipelineEntries } from './schema';

export async function getCardPayloads(
  db: DbOrTx,
  i: { viewer: ThreadViewer; cards: ThreadCard[] },
): Promise<Record<string, CardPayload>> {
  const out: Record<string, CardPayload> = {};
  const ids = (type: ThreadCard['type']) => i.cards.filter((card) => card.type === type).map((card) => card.refId);
  const applicationIds = ids('application');
  const inviteIds = ids('invite');
  const interviewIds = ids('interview');
  const offerIds = ids('offer');
  const applicationRows =
    applicationIds.length === 0
      ? []
      : await db.select().from(pipelineEntries).where(inArray(pipelineEntries.applicationId, applicationIds));
  const interviews = await interviewBundles(db, interviewIds);
  const offers = await offerBundles(db, offerIds);
  const listingIds = [
    ...applicationRows.map((row) => row.listingId),
    ...[...interviews.values()].map((bundle) => bundle.listingId),
    ...[...offers.values()].map((bundle) => bundle.listingId),
  ];
  const infos = await getHiringInfoMany(db, [...new Set(listingIds)]);
  const titles = new Map(infos.map((info) => [info.id, info.title]));

  if (i.viewer.kind === 'seeker') {
    const userId = i.viewer.userId;
    for (const row of applicationRows) {
      if (row.seekerUserId !== userId) continue;
      out[row.applicationId] = {
        type: 'application',
        applicationId: row.applicationId,
        title: titles.get(row.listingId) ?? '',
        submittedAt: row.appliedAt.toISOString(),
        status: seekerStatus(row.status as ApplicationStatus),
      };
    }
    const invites = (await seekerInviteItems(db, userId, inviteIds)) as Map<string, SeekerInviteItem>;
    for (const id of inviteIds) {
      const invite = invites.get(id);
      if (!invite) continue;
      out[id] = { type: 'invite', invite };
    }
    const seekerInterviews = await seekerInterviewViews(db, userId, interviewIds);
    for (const [id, interview] of seekerInterviews) out[id] = { type: 'interview', interview };
    const seekerOffers = await seekerOfferViews(db, userId, offerIds);
    for (const [id, offer] of seekerOffers) out[id] = { type: 'offer', offer };
    return out;
  }

  const host = i.viewer;
  const scope = await listingScope(db, host.ctx);
  const visible = (orgId: string, listingId: string) => orgId === host.ctx.orgId && inScope(scope, listingId);
  if (applicationIds.length > 0) await getHostCards(db, { orgId: host.ctx.orgId, applicationIds });
  for (const row of applicationRows) {
    if (!visible(row.orgId, row.listingId)) continue;
    out[row.applicationId] = {
      type: 'application',
      applicationId: row.applicationId,
      title: titles.get(row.listingId) ?? '',
      submittedAt: row.appliedAt.toISOString(),
      status: row.status as ApplicationStatus,
    };
  }
  const hostInvites = (await hostInviteItems(db, host.ctx, inviteIds)) as Map<string, HostInviteItem>;
  for (const id of inviteIds) {
    const invite = hostInvites.get(id);
    if (!invite) continue;
    out[id] = { type: 'invite', invite };
  }
  for (const [id, bundle] of interviews) {
    if (!visible(bundle.orgId, bundle.listingId)) continue;
    out[id] = { type: 'interview', interview: bundle.view };
  }
  for (const [id, bundle] of offers) {
    if (!visible(bundle.orgId, bundle.listingId)) continue;
    out[id] = { type: 'offer', offer: bundle.view };
  }
  return out;
}
