// GET /api/v1/discovery/states?tz=: Browse by State's live counts (FD-8 addendum, plan Task 49),
// one per US_STATES code. Every count is the total Seek shows for that state; nothing here is
// sample data. "Today" is in the `tz` param's zone, else the `ee_tz` cookie's, else Chicago.
import { DEFAULT_TZ, resolveTimeZone } from '@/lib/discovery';
import { countListingsByState } from '@/modules/discovery';
import { apiRoute } from '@/server/api';
import { privateJson, TZ_COOKIE } from '@/server/viewer';
import { privateRoute, stateParams } from '../_shared/params';

function cookie(req: Request, name: string): string | null {
  for (const part of req.headers.get('cookie')?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** The param's zone when it is a known one, else the cookie's, else America/Chicago. */
function viewerZone(param: string | undefined, req: Request): string {
  const fromParam = resolveTimeZone(param);
  if (fromParam !== DEFAULT_TZ || param === DEFAULT_TZ) return fromParam;
  return resolveTimeZone(cookie(req, TZ_COOKIE));
}

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: stateParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/states',
      summary: 'Open job counts for every US state and territory',
    },
    handler: async ({ db, req, input }) => {
      const states = await countListingsByState(db, { tz: viewerZone(input.tz, req) });
      return privateJson({ states });
    },
  }),
);
