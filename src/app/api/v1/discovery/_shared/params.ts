// The discovery read routes' own parameters (SP3 spec 5 and 10, plan Task 22): paging and
// geometry. These fail with a 400 and details; the filter params never do (prepareQuery drops
// what is invalid, spec 8.1), and neither do `sort` and `tz`, which fall back to relevant and
// America/Chicago (Review Focus 3).
import { z } from 'zod';
import { isAppError } from '@/lib/errors';
import { scrubError, stripQueryParams } from '@/lib/logger';
import type { RouteHandler } from '@/server/api';

const SORTS = ['relevant', 'newest', 'distance'] as const;

/** Read by prepareQuery; an unknown value is relevant, never a 400. */
export const sortParam = z.enum(SORTS).optional().catch(undefined);
/** Resolved by the viewer; an unknown zone is America/Chicago, never a 400. */
export const tzParam = z.string().optional().catch(undefined);
export const cursorParam = z.string().min(1).max(2048).optional();

const round2 = (n: number) => Math.round(n * 100) / 100;
export const latParam = z.coerce.number().finite().min(-90).max(90).transform(round2).optional();
export const lngParam = z.coerce.number().finite().min(-180).max(180).transform(round2).optional();

/** `w,s,e,n`: longitudes within ±180, latitudes within ±90, south ≤ north; west > east crosses the antimeridian. */
export const bboxParam = z
  .string()
  .max(200)
  .transform((v, ctx): [number, number, number, number] => {
    const parts = v.split(',').map((p) => (p.trim() === '' ? Number.NaN : Number(p)));
    const [w, s, e, n] = parts;
    const lng = (x: number | undefined): x is number =>
      x !== undefined && Number.isFinite(x) && x >= -180 && x <= 180;
    const lat = (x: number | undefined): x is number =>
      x !== undefined && Number.isFinite(x) && x >= -90 && x <= 90;
    if (parts.length !== 4 || !lng(w) || !lat(s) || !lng(e) || !lat(n) || s > n) {
      ctx.addIssue({
        code: 'custom',
        message: 'bbox is west,south,east,north with lng within ±180 and lat within ±90',
      });
      return z.NEVER;
    }
    return [w, s, e, n];
  });

export const zoomParam = z.coerce.number().finite().min(0).max(22);

const limitParam = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

/** `lat` and `lng` come together or not at all. */
const bothOrNeither = (v: { lat?: number; lng?: number }) =>
  (v.lat === undefined) === (v.lng === undefined);

const paging = {
  sort: sortParam,
  cursor: cursorParam,
  tz: tzParam,
  lat: latParam,
  lng: lngParam,
};

export const searchParams = z
  .object({
    ...paging,
    limit: limitParam(50, 20),
    bbox: bboxParam.optional(),
    surface: z.literal('map_list').optional(),
  })
  .refine(bothOrNeither, { message: 'Send lat and lng together', path: ['lat'] })
  .refine((v) => v.surface !== 'map_list' || v.bbox !== undefined, {
    message: 'The map_list surface needs a bbox',
    path: ['bbox'],
  });

export const deckParams = z
  .object({ ...paging, limit: limitParam(20, 10) })
  .refine(bothOrNeither, { message: 'Send lat and lng together', path: ['lat'] });

export const mapParams = z.object({ tz: tzParam, bbox: bboxParam, zoom: zoomParam });

export const locationParams = z.object({
  locationId: z.string().max(64),
  cursor: cursorParam,
  tz: tzParam,
});

export const suggestParams = z.object({ q: z.string().trim().min(2).max(100) });

export const listingParams = z.object({ id: z.string().max(64), tz: tzParam });

export const stateParams = z.object({ tz: tzParam });

/** The filter params of the request URL, for prepareQuery. */
export const filterParams = (req: Request) => new URL(req.url).searchParams;

/** The distance origin, when both coordinates came. */
export function originOf(i: {
  lat?: number;
  lng?: number;
}): { lat: number; lng: number } | undefined {
  return i.lat !== undefined && i.lng !== undefined ? { lat: i.lat, lng: i.lng } : undefined;
}

/**
 * `err` with the search text taken out, so the error log never holds it (spec 10): a failed
 * query's parameters are dropped, and any copy of `q` left in a message, a stack or a cause
 * is replaced. Our own AppErrors carry no search text and pass through.
 */
export function withoutSearchText(err: unknown, q: string | null): unknown {
  if (!q || isAppError(err)) return err;
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const clean = (text: string) => stripQueryParams(text).replace(pattern, '[search text]');
  const copy = (e: unknown, depth: number): Error => {
    const source = scrubError(e);
    if (!(source instanceof Error)) return new Error('Search failed');
    const out = new Error(clean(source.message));
    out.name = source.name;
    out.stack = source.stack === undefined ? undefined : clean(source.stack);
    if ('code' in source && (typeof source.code === 'string' || typeof source.code === 'number')) {
      Object.assign(out, { code: source.code });
    }
    if (source.cause !== undefined && depth < 3) out.cause = copy(source.cause, depth + 1);
    return out;
  };
  return copy(err, 0);
}

/** Runs `fn`, rethrowing any failure without the search text. */
export async function redactingSearchText<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw withoutSearchText(err, new URL(req.url).searchParams.get('q'));
  }
}

/** Every discovery response, errors included, is `Cache-Control: private, no-store`. */
export function privateRoute(handler: RouteHandler): RouteHandler {
  return async (req, route) => {
    const res = await handler(req, route);
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
