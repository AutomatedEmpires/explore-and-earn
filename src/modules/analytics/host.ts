// Host analytics. Reads hiring's facts and discovery counts; it writes nothing.
import type { AnalyticsRange, HostAnalytics, Slice } from '@/lib/host-analytics';
import type { DbOrTx } from '@/lib/db';
import { SOURCE_LABELS } from '@/lib/hiring';
import { getListingEventCounts } from '@/modules/discovery';
import {
  applicationSources,
  applicationsByListing,
  countPipelineKinds,
  firstPipelineEventAt,
  getAsDescribedSummary,
  pipelineStatusCounts,
  weeklyApplications,
} from '@/modules/hiring';
import { countFollowersAt } from '@/modules/hostpages';
import { listForOrg } from '@/modules/listings';
import { getBoostWindows } from './boost';
import { resolveRange, type ResolvedRange } from './ranges';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  interviewing: 'Interviewing',
  offered: 'Offered',
  hired: 'Hired',
  not_selected: 'Not selected',
  withdrawn: 'Withdrawn',
  offer_declined: 'Offer declined',
};

const STATUS_ORDER = Object.keys(STATUS_LABELS);
const INVITE_KINDS = ['invite_sent', 'invite_interested', 'invite_applied'] as const;
const SOURCE_ORDER = Object.entries(SOURCE_LABELS);

type ListingRow = { id: string; title: string; locationId: string | null };

function metric(value: number, previous: number | null): { value: number; previous: number | null } {
  return { value, previous };
}

function slice(key: string, label: string, value: number): Slice {
  return { key, label, value };
}

function sumCounts(
  rows: { type: string; count: number }[],
  type: string,
): number {
  return rows.reduce((sum, row) => (row.type === type ? sum + Number(row.count) : sum), 0);
}

export async function getHostAnalytics(
  db: DbOrTx,
  q: {
    orgId: string;
    range: AnalyticsRange;
    listingIds: string[] | 'all';
    locationId?: string;
    tz: string;
    now?: Date;
  },
): Promise<HostAnalytics> {
  const now = q.now ?? new Date();
  const orgListings = await listForOrg(db, q.orgId);
  const wanted = q.listingIds === 'all' ? null : new Set(q.listingIds);
  const listings: ListingRow[] = orgListings.filter((row) => {
    if (wanted && !wanted.has(row.id)) return false;
    if (q.locationId && row.locationId !== q.locationId) return false;
    return true;
  });
  const ids = listings.map((row) => row.id);

  let bounds: ResolvedRange = resolveRange(q.range, q.tz, now);
  if (q.range === 'all') {
    const first = await firstPipelineEventAt(db, q.orgId);
    bounds = { from: first ?? new Date(0), to: bounds.to, previous: null };
  }

  const singleSelected = q.listingIds !== 'all' && q.listingIds.length === 1 && ids.length === 1;
  const asDescribed = await getAsDescribedSummary(
    db,
    singleSelected
      ? { orgId: q.orgId, listingId: ids[0] }
      : q.listingIds === 'all' && !q.locationId
        ? { orgId: q.orgId }
        : { orgId: q.orgId, listingIds: ids },
  );

  const [currentEvents, previousEvents, currentKinds, previousKinds, sources, statuses, weeklyApps, weeklyViews, followersNow, followersThen, windows] =
    await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : getListingEventCounts(db, {
            orgId: q.orgId,
            listingIds: ids,
            from: bounds.from,
            to: bounds.to,
            types: ['view', 'save'],
            bucket: 'none',
          }),
      ids.length === 0 || !bounds.previous
        ? Promise.resolve([])
        : getListingEventCounts(db, {
            orgId: q.orgId,
            listingIds: ids,
            from: bounds.previous.from,
            to: bounds.previous.to,
            types: ['view', 'save'],
            bucket: 'none',
          }),
      countPipelineKinds(
        db,
        q.orgId,
        ids,
        ['applied', 'interview_scheduled', 'hired', ...INVITE_KINDS],
        bounds.from,
        bounds.to,
      ),
      bounds.previous
        ? countPipelineKinds(
            db,
            q.orgId,
            ids,
            ['applied', 'interview_scheduled', 'hired'],
            bounds.previous.from,
            bounds.previous.to,
          )
        : Promise.resolve(new Map<string, number>()),
      applicationSources(db, q.orgId, ids, bounds.from, bounds.to),
      pipelineStatusCounts(db, q.orgId, ids),
      weeklyApplications(db, q.orgId, ids, bounds.from, bounds.to),
      ids.length === 0
        ? Promise.resolve([])
        : getListingEventCounts(db, {
            orgId: q.orgId,
            listingIds: ids,
            from: bounds.from,
            to: bounds.to,
            types: ['view'],
            bucket: 'week',
          }),
      countFollowersAt(db, q.orgId, bounds.to),
      countFollowersAt(db, q.orgId, bounds.from),
      getBoostWindows(db, {
        orgId: q.orgId,
        from: bounds.from,
        to: bounds.to,
        listingIds: ids,
      }),
    ]);

  const previousOf = (key: string) => (bounds.previous ? (previousKinds.get(key) ?? 0) : null);
  const views = sumCounts(currentEvents, 'view');
  const saves = sumCounts(currentEvents, 'save');
  const applications = currentKinds.get('applied') ?? 0;
  const interviews = currentKinds.get('interview_scheduled') ?? 0;
  const hires = currentKinds.get('hired') ?? 0;

  const perListingCounts = await applicationsByListing(db, q.orgId, ids, bounds.from, bounds.to);
  const viewWeeks = new Map<string, number>();
  for (const row of weeklyViews) {
    if (!row.bucketStart) continue;
    const week = row.bucketStart.slice(0, 10);
    viewWeeks.set(week, (viewWeeks.get(week) ?? 0) + Number(row.count));
  }
  const weeks = [...new Set([...viewWeeks.keys(), ...weeklyApps.keys()])].sort();

  const boost = [];
  for (const window of windows) {
    const duration = window.endsAt.getTime() - window.startsAt.getTime();
    if (duration <= 0) continue;
    const [duringRows, beforeRows] = await Promise.all([
      getListingEventCounts(db, {
        orgId: q.orgId,
        listingIds: [window.listingId],
        from: window.startsAt,
        to: window.endsAt,
        types: ['view'],
        bucket: 'none',
      }),
      getListingEventCounts(db, {
        orgId: q.orgId,
        listingIds: [window.listingId],
        from: new Date(window.startsAt.getTime() - duration),
        to: window.startsAt,
        types: ['view'],
        bucket: 'none',
      }),
    ]);
    boost.push({
      listingId: window.listingId,
      during: sumCounts(duringRows, 'view'),
      before: sumCounts(beforeRows, 'view'),
    });
  }

  return {
    tiles: {
      views: metric(views, bounds.previous ? sumCounts(previousEvents, 'view') : null),
      saves: metric(saves, bounds.previous ? sumCounts(previousEvents, 'save') : null),
      applications: metric(applications, previousOf('applied')),
      interviews: metric(interviews, previousOf('interview_scheduled')),
      hires: metric(hires, previousOf('hired')),
      followers: metric(followersNow, bounds.previous ? followersThen : null),
    },
    funnel: [
      slice('views', 'Views', views),
      slice('applications', 'Applications', applications),
      slice('interviews', 'Interviews', interviews),
      slice('hires', 'Hires', hires),
    ],
    perListing: listings.map((row) =>
      slice(row.id, row.title, perListingCounts.get(row.id) ?? 0),
    ),
    weekly: weeks.map((week) => ({
      week,
      views: viewWeeks.get(week) ?? 0,
      applications: weeklyApps.get(week) ?? 0,
    })),
    invites: [
      slice('invite_sent', 'Sent', currentKinds.get('invite_sent') ?? 0),
      slice('invite_interested', 'Interested', currentKinds.get('invite_interested') ?? 0),
      slice('invite_applied', 'Applied', currentKinds.get('invite_applied') ?? 0),
    ],
    boost,
    asDescribed,
    sources: SOURCE_ORDER.map(([key, label]) => slice(key, label, sources.get(key) ?? 0)),
    statuses: STATUS_ORDER.flatMap((key) => {
      const value = statuses.get(key) ?? 0;
      return value > 0 ? [slice(key, STATUS_LABELS[key] ?? key, value)] : [];
    }),
  };
}
