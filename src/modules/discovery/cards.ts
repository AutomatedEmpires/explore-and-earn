// Card hydration (SP3 spec 3.1, plan Task 10): projection rows to JobCardData, with the
// viewer's disposition and applied state, boosted labels from the placement hook, and the date
// line in the viewer's time zone. Every surface's cards come through loadCards.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  dateLine,
  todayIn,
  type DiscoverySource,
  type DispositionState,
  type JobCardData,
} from '@/lib/discovery';
import { logger } from '@/lib/logger';
import type { ListingContent } from '@/modules/listings';
import { getPlacementHook, overlayApplied } from './hooks';
import { projectionSelect, type ProjectionRow } from './projection-columns';

export type CardContext = {
  /** YYYY-MM-DD in the viewer's time zone. */
  today: string;
  /** The surface; an inserted boost slot passes 'boost'. */
  source: DiscoverySource;
  viewer: JobCardData['viewer'];
  boostId: string | null;
};

export type LoadCardsOptions = {
  viewerUserId: string | null;
  tz: string;
  source: DiscoverySource;
  includeClosed?: boolean;
  /** listingId -> boostId for boosted slots the placement hook inserted. */
  boostIds?: Map<string, string>;
  now?: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The row's schedule in SP2's `when` shape, for dateLine. */
function rowWhen(row: ProjectionRow): ListingContent['when'] {
  const base = { weeklyHours: row.weeklyHours, minCommitment: null };
  if (row.scheduleKind === 'fixed' && row.startOn && row.endOn) {
    return { ...base, dates: { mode: 'fixed', start: row.startOn, end: row.endOn } };
  }
  if (row.scheduleKind === 'season' && row.season && row.seasonYear !== null) {
    return { ...base, dates: { mode: 'season', season: row.season, year: row.seasonYear } };
  }
  return { ...base, dates: { mode: 'ongoing', start: row.startOn } };
}

/** One card. Pure. */
export function rowToCard(row: ProjectionRow, ctx: CardContext): JobCardData {
  return {
    listingId: row.listingId,
    href: `/jobs/view/${row.listingId}/${row.slug}?source=${ctx.source}`,
    title: row.title,
    category: row.category,
    secondaryCategory: row.secondaryCategory,
    genre: row.genre,
    status: row.isActive ? 'active' : 'closed',
    remote: row.remote,
    locationLabel: row.locationLabel,
    host: {
      orgId: row.orgId,
      name: row.hostName,
      slug: row.hostSlug,
      logoUrl: row.hostLogoUrl,
      subscriberSince: row.hostSince,
    },
    cover: row.cover,
    dateLine: dateLine(rowWhen(row), ctx.today),
    housing: {
      provided: row.housingProvided,
      free: row.housingFree,
      costLine: row.housingCostLine,
      note: row.housingNote,
    },
    meals: {
      provided: row.mealsProvided,
      free: row.mealsFree,
      costLine: row.mealsCostLine,
      note: row.mealsNote,
    },
    pay: { chip: row.payChip, full: row.payFull, details: row.payDetails },
    sponsorsVisas: row.sponsorsVisas,
    boosted: ctx.boostId ? { boostId: ctx.boostId } : null,
    viewer: ctx.viewer,
  };
}

/** listingId -> boostId from the placement hook; empty (and logged) when the hook fails. */
export async function boostedLabels(
  db: DbOrTx,
  ids: string[],
  now: Date,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  try {
    const hook = await getPlacementHook();
    return await hook.boostedAmong(db, ids, now);
  } catch (err) {
    logger.warn('discovery.boosted_among_failed', { err });
    return new Map();
  }
}

/**
 * Cards for `ids`, in input order. Unknown ids are skipped, and so are closed listings unless
 * `includeClosed` is set. Guests get `viewer: null`.
 */
export async function loadCards(
  db: DbOrTx,
  ids: string[],
  o: LoadCardsOptions,
): Promise<JobCardData[]> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (wanted.length === 0) return [];
  const now = o.now ?? new Date();
  const list = sql.join(
    wanted.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await queryRows<ProjectionRow>(
    db,
    sql`select ${projectionSelect('dl')} from app.discovery_listings dl
      where dl.listing_id in (${list}) ${o.includeClosed ? sql`` : sql`and dl.is_active`}`,
  );
  const byId = new Map(rows.map((r) => [r.listingId, r]));
  const found = wanted.filter((id) => byId.has(id));
  if (found.length === 0) return [];

  let dispositions = new Map<string, DispositionState>();
  let applied = new Set<string>();
  if (o.viewerUserId) {
    const foundList = sql.join(
      found.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const disp = await queryRows<{ id: string; state: DispositionState }>(
      db,
      sql`select listing_id::text as id, state from app.listing_dispositions
        where user_id = ${o.viewerUserId}::uuid and listing_id in (${foundList})`,
    );
    dispositions = new Map(disp.map((d) => [d.id, d.state]));
    applied = await overlayApplied(db, o.viewerUserId, found);
  }

  const among = await boostedLabels(db, found, now);
  const today = todayIn(o.tz, now);
  return found.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const slot = o.boostIds?.get(id) ?? null;
    return [
      rowToCard(row, {
        today,
        source: slot ? 'boost' : o.source,
        viewer: o.viewerUserId
          ? { disposition: dispositions.get(id) ?? null, applied: applied.has(id) }
          : null,
        boostId: slot ?? among.get(id) ?? null,
      }),
    ];
  });
}
