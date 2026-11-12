// The locations module's outbox handlers (SP2 spec section 6):
// - locations.resolve_nws_grid, on `location.updated`: the NWS grid lookup, a timezone
//   suggestion and, for orgs the weather filter keeps, a first forecast fetch, so a new location
//   shows weather without waiting for the next refresh.
// - locations.refresh_weather, every 30 minutes: the forecast for every live location of the
//   orgs the filter keeps, at most 5 requests at a time.
// Provider failures are counted on the location's weather row and never fail the job.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isUSStateCode, STATE_DEFAULT_TIMEZONE } from '@/lib/us-states';
import { readEnvelope, type HandlerMap } from '@/modules/jobs';
import { locations } from './schema';
import {
  filterWeatherOrgs,
  getWeatherProvider,
  recordWeatherFailure,
  saveWeather,
  type WeatherProvider,
} from './weather';

const REFRESH_CONCURRENCY = 5;
/**
 * The refresh starts no new location after this long, so it ends inside the jobs route's 60 s
 * (each location makes at most two 5 s requests). It handles the stalest locations first, so
 * the ones it skips go first next time.
 */
const REFRESH_BUDGET_MS = 25_000;

type Target = {
  id: string;
  orgId: string;
  lat: number;
  lng: number;
  state: string;
  timezone: string;
  nwsForecastUrl: string | null;
};

function validTimezone(name: string): string | null {
  if (!name) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Looks up the location's NWS grid and stores the forecast URL (null when there is none, which
 * counts as a failure). The timezone takes NWS's suggestion only while it still equals the
 * state's default, so a timezone the host chose is kept.
 */
async function resolveGrid(
  db: DbOrTx,
  target: Target,
  provider: WeatherProvider,
): Promise<string | null> {
  let grid: Awaited<ReturnType<WeatherProvider['points']>>;
  try {
    grid = await provider.points(target.lat, target.lng);
  } catch (err) {
    await recordWeatherFailure(db, target.id, err);
    return null;
  }

  if (!grid) {
    await db.update(locations).set({ nwsForecastUrl: null }).where(eq(locations.id, target.id));
    await recordWeatherFailure(db, target.id, 'NWS has no forecast grid for this point');
    return null;
  }

  await db
    .update(locations)
    .set({ nwsForecastUrl: grid.forecastHourlyUrl })
    .where(and(eq(locations.id, target.id), isNull(locations.archivedAt)));

  // Checked in the update itself, so an edit the host made meanwhile is never overwritten.
  const stateDefault = isUSStateCode(target.state) ? STATE_DEFAULT_TIMEZONE[target.state] : null;
  const suggested = validTimezone(grid.timeZone);
  if (stateDefault && suggested && suggested !== stateDefault) {
    await db
      .update(locations)
      .set({ timezone: suggested })
      .where(
        and(
          eq(locations.id, target.id),
          eq(locations.state, target.state),
          eq(locations.timezone, stateDefault),
        ),
      );
  }
  return grid.forecastHourlyUrl;
}

async function fetchForecast(
  db: DbOrTx,
  locationId: string,
  url: string,
  provider: WeatherProvider,
  now: Date,
): Promise<boolean> {
  try {
    const period = await provider.firstHourlyPeriod(url);
    await saveWeather(db, locationId, period, now);
    return true;
  } catch (err) {
    await recordWeatherFailure(db, locationId, err);
    return false;
  }
}

/** Live locations of active, undeleted orgs; the stalest weather first. */
async function loadTargets(db: DbOrTx, locationId?: string): Promise<Target[]> {
  return queryRows<Target>(
    db,
    sql`
      select l.id, l.org_id as "orgId", ST_Y(l.point::geometry) as lat,
        ST_X(l.point::geometry) as lng, l.state, l.timezone,
        l.nws_forecast_url as "nwsForecastUrl"
      from app.locations l
      join app.organizations o on o.id = l.org_id
      left join app.location_weather w on w.location_id = l.id
      where l.archived_at is null and o.deleted_at is null and o.status = 'active'
        ${locationId === undefined ? sql`` : sql`and l.id = ${locationId}`}
      order by w.fetched_at asc nulls first, l.id
    `,
  );
}

/** The `location.updated` subscriber. Resolves even when NWS fails. */
export async function resolveNwsGrid(
  db: DbOrTx,
  locationId: string,
  o: { provider?: WeatherProvider; now?: Date } = {},
): Promise<void> {
  const [target] = await loadTargets(db, locationId);
  if (!target) return;
  const provider = o.provider ?? getWeatherProvider();

  const url = await resolveGrid(db, target, provider);
  if (!url) return;
  if (!(await filterWeatherOrgs(db, [target.orgId])).has(target.orgId)) return;
  await fetchForecast(db, target.id, url, provider, o.now ?? new Date());
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
async function eachLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

export type RefreshResult = { locations: number; fetched: number; failed: number; skipped: number };

/** The refresh that runs every 30 minutes. */
export async function refreshWeather(
  db: DbOrTx,
  o: { provider?: WeatherProvider; now?: Date; concurrency?: number; budgetMs?: number } = {},
): Promise<RefreshResult> {
  const provider = o.provider ?? getWeatherProvider();
  const now = o.now ?? new Date();
  const budgetMs = o.budgetMs ?? REFRESH_BUDGET_MS;
  const started = Date.now();

  const candidates = await loadTargets(db);
  const kept = await filterWeatherOrgs(
    db,
    candidates.map((c) => c.orgId),
  );
  const targets = candidates.filter((c) => kept.has(c.orgId));

  const result: RefreshResult = { locations: targets.length, fetched: 0, failed: 0, skipped: 0 };
  await eachLimited(targets, o.concurrency ?? REFRESH_CONCURRENCY, async (target) => {
    if (Date.now() - started > budgetMs) {
      result.skipped += 1;
      return;
    }
    const url = target.nwsForecastUrl ?? (await resolveGrid(db, target, provider));
    const ok = url ? await fetchForecast(db, target.id, url, provider, now) : false;
    if (ok) result.fetched += 1;
    else result.failed += 1;
  });

  if (result.failed > 0 || result.skipped > 0) {
    logger.warn('weather refresh finished with failures or skips', result);
  }
  return result;
}

export const jobHandlers: HandlerMap = {
  'locations.resolve_nws_grid': async (payload, { db, now }) => {
    const { data } = readEnvelope(payload, 'location.updated');
    await resolveNwsGrid(db, data.locationId, { now });
  },
  'locations.refresh_weather': async (_payload, { db, now }) => {
    await refreshWeather(db, { now });
  },
};
