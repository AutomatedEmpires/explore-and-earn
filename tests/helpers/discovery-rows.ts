// Projection rows for SP3 unit tests, written straight into app.discovery_listings (no sync).
// The default row is an active Seasonal "Lift operator" at Kettle Ridge Lodge in Breckenridge,
// CO: $19/hr at 40 hours a week, paid housing, starting 2026-12-01, published a day ago.
//
// Every field can be overridden, and the fields derived from others follow the overrides: a new
// title changes the slug, the occupation and the search document; a new state without a point
// moves the row to that state's centroid; a Remote row defaults to `remote_states {US}`.
import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { stateByCode } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import { GENRES, type Category } from '@/lib/taxonomy';
import { searchVectorSql, type ProjectionRowInput } from '@/modules/discovery';
import { DEFAULT_LOCATION_ID, DEFAULT_ORG_ID } from '../fakes/listing-content';

// The default row's host and location are the SP2 fakes' defaults.
export { DEFAULT_LOCATION_ID, DEFAULT_ORG_ID };

const DAY_MS = 86_400_000;

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** A complete row: the defaults, with `o` over them and the derived fields recomputed. */
export function projectionRow(
  o: Partial<ProjectionRowInput> = {},
  now = new Date(),
): ProjectionRowInput {
  const title = o.title ?? 'Lift operator';
  const category = o.category ?? 'seasonal';
  const secondaryCategory = o.secondaryCategory ?? null;
  const remote = o.remote ?? false;
  const state = o.state ?? 'CO';
  const st = stateByCode(state);
  const atDefaultPlace = o.state === undefined;
  const city = o.city !== undefined ? o.city : atDefaultPlace ? 'Breckenridge' : null;
  const lat = o.lat ?? (atDefaultPlace ? 39.48 : (st?.centroid.lat ?? 39.48));
  const lng = o.lng ?? (atDefaultPlace ? -106.04 : (st?.centroid.lng ?? -106.04));
  const remoteStates = o.remoteStates ?? (remote ? ['US'] : []);
  const genre = o.genre !== undefined ? o.genre : 'ski-resorts';
  const weeklyHours = o.weeklyHours ?? 40;
  const payHourlyMinCents = o.payHourlyMinCents !== undefined ? o.payHourlyMinCents : 1900;
  const payHourlyMaxCents =
    o.payHourlyMaxCents !== undefined ? o.payHourlyMaxCents : payHourlyMinCents;
  const pay =
    payHourlyMinCents === null
      ? 'Pay on request'
      : payHourlyMaxCents !== null && payHourlyMaxCents !== payHourlyMinCents
        ? `${dollars(payHourlyMinCents)}–${dollars(payHourlyMaxCents)}/hr`
        : `${dollars(payHourlyMinCents)}/hr`;
  const housingProvided = o.housingProvided ?? true;
  const housingFree = o.housingFree ?? false;
  const mealsProvided = o.mealsProvided ?? false;
  const mealsFree = o.mealsFree ?? false;
  const occupationLabel = o.occupationLabel ?? title;
  const hostName = o.hostName ?? 'Kettle Ridge Lodge';
  const publishedAt = o.publishedAt ?? new Date(now.getTime() - DAY_MS);
  const destinationSlug = o.destinationSlug ?? null;
  const genreLabel =
    genre === null
      ? null
      : (GENRES.find((g) => g.code === genre.replace(/-/g, '_'))?.label ?? genre);

  return {
    listingId: o.listingId ?? newId(),
    revisionId: o.revisionId ?? newId(),
    orgId: o.orgId ?? DEFAULT_ORG_ID,
    locationId: o.locationId ?? DEFAULT_LOCATION_ID,
    isActive: o.isActive ?? true,
    slug: o.slug ?? slug(title),
    title,
    occupationCode: o.occupationCode ?? slug(occupationLabel).replace(/-/g, '_'),
    occupationLabel,
    locationLabel:
      o.locationLabel ??
      (remote
        ? `Remote · ${remoteStates.includes('US') ? 'US' : remoteStates.join(', ')}`
        : city
          ? `${city}, ${state}`
          : (st?.name ?? state)),
    city,
    genre,
    destinationSlug,
    category,
    secondaryCategory,
    categories: o.categories ?? (secondaryCategory ? [category, secondaryCategory] : [category]),
    employmentType: o.employmentType ?? 'employee',
    hoursType: o.hoursType ?? 'full_time',
    hostName,
    hostSlug: o.hostSlug ?? slug(hostName),
    hostLogoUrl: o.hostLogoUrl ?? null,
    hostSince: o.hostSince ?? null,
    state,
    lat,
    lng,
    approximate: o.approximate ?? true,
    remote,
    remoteStates,
    scheduleKind: o.scheduleKind ?? 'fixed',
    startOn: o.startOn !== undefined ? o.startOn : '2026-12-01',
    endOn: o.endOn !== undefined ? o.endOn : '2027-04-15',
    season: o.season ?? null,
    seasonYear: o.seasonYear ?? null,
    weeklyHours,
    payHourlyMinCents,
    payHourlyMaxCents,
    payYearlyMinCents:
      o.payYearlyMinCents !== undefined
        ? o.payYearlyMinCents
        : payHourlyMinCents === null
          ? null
          : Math.round(payHourlyMinCents * weeklyHours * 52),
    payChip: o.payChip ?? pay,
    payFull: o.payFull ?? pay,
    payDetails: o.payDetails ?? ['Paid every 2 weeks'],
    housingProvided,
    housingFree,
    mealsProvided,
    mealsFree,
    sponsorsVisas: o.sponsorsVisas ?? false,
    housingCostLine:
      o.housingCostLine !== undefined
        ? o.housingCostLine
        : housingProvided
          ? housingFree
            ? 'Free'
            : '$150/week · deducted from pay'
          : null,
    housingNote: o.housingNote ?? null,
    mealsCostLine:
      o.mealsCostLine !== undefined
        ? o.mealsCostLine
        : mealsProvided
          ? mealsFree
            ? 'Free'
            : '$10/day · deducted from pay'
          : null,
    mealsNote: o.mealsNote ?? null,
    cover: o.cover ?? null,
    publishedAt,
    firstActiveAt: o.firstActiveAt ?? publishedAt,
    indexedAt: o.indexedAt ?? now,
    confirmedActiveAt: o.confirmedActiveAt ?? null,
    closedAt: o.closedAt ?? null,
    vector: o.vector ?? {
      title,
      occupationLabel,
      hostName,
      genreLabel,
      categoryLabel: CATEGORY_LABELS[category] ?? null,
      destinationName: null,
      city,
      stateName: st?.name ?? null,
      description: null,
    },
  };
}

const textArray = (values: string[]) =>
  sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

function values(r: ProjectionRowInput): SQL {
  return sql`(${r.listingId}, ${r.revisionId}, ${r.orgId}, ${r.locationId}, ${r.isActive},
    ${r.slug}, ${r.title}, ${r.occupationCode}, ${r.occupationLabel}, ${r.locationLabel},
    ${r.city}, ${r.genre}, ${r.destinationSlug}, ${r.category}, ${r.secondaryCategory},
    ${textArray(r.categories)}, ${r.employmentType}, ${r.hoursType}, ${r.hostName}, ${r.hostSlug},
    ${r.hostLogoUrl}, ${r.hostSince}::date, ${r.state},
    ST_SetSRID(ST_MakePoint(${r.lng}::float8, ${r.lat}::float8), 4326)::geography,
    ${r.approximate}, ${r.remote}, ${textArray(r.remoteStates)}, ${r.scheduleKind},
    ${r.startOn}::date, ${r.endOn}::date, ${r.season}, ${r.seasonYear}::int, ${r.weeklyHours},
    ${r.payHourlyMinCents}::int, ${r.payHourlyMaxCents}::int, ${r.payYearlyMinCents}::int,
    ${r.payChip}, ${r.payFull}, ${textArray(r.payDetails)}, ${r.housingProvided},
    ${r.housingFree}, ${r.mealsProvided}, ${r.mealsFree}, ${r.sponsorsVisas},
    ${r.housingCostLine}, ${r.housingNote}, ${r.mealsCostLine}, ${r.mealsNote},
    ${r.cover === null ? null : JSON.stringify(r.cover)}::jsonb,
    ${r.publishedAt.toISOString()}::timestamptz, ${r.firstActiveAt.toISOString()}::timestamptz,
    ${r.indexedAt.toISOString()}::timestamptz,
    ${r.confirmedActiveAt?.toISOString() ?? null}::timestamptz,
    ${r.closedAt?.toISOString() ?? null}::timestamptz, ${searchVectorSql(r.vector)})`;
}

/** Inserts one projection row per override set and returns their listing ids, in order. */
export async function insertProjectionRows(
  db: DbOrTx,
  rows: Partial<ProjectionRowInput>[],
  now = new Date(),
): Promise<string[]> {
  const full = rows.map((o) => projectionRow(o, now));
  for (let i = 0; i < full.length; i += 200) {
    const chunk = full.slice(i, i + 200);
    await db.execute(sql`
      insert into app.discovery_listings (listing_id, revision_id, org_id, location_id, is_active,
        slug, title, occupation_code, occupation_label, location_label, city, genre,
        destination_slug, category, secondary_category, categories, employment_type, hours_type,
        host_name, host_slug, host_logo_url, host_since, state, geog, approximate, remote,
        remote_states, schedule_kind, start_on, end_on, season, season_year, weekly_hours,
        pay_hourly_min_cents, pay_hourly_max_cents, pay_yearly_min_cents, pay_chip, pay_full,
        pay_details, housing_provided, housing_free, meals_provided, meals_free, sponsors_visas,
        housing_cost_line, housing_note, meals_cost_line, meals_note, cover, published_at,
        first_active_at, indexed_at, confirmed_active_at, closed_at, search)
      values ${sql.join(chunk.map(values), sql`, `)}
    `);
  }
  return full.map((r) => r.listingId);
}
