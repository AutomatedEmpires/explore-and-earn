// GET /api/v1/discovery/suggest?q=: the search box's Jobs, Places and Employers groups, up to 5
// each (SP3 spec section 5). `q` is 2 to 100 characters.
import { suggest } from '@/modules/discovery';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';
import { privateRoute, redactingSearchText, suggestParams } from '../_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: suggestParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/suggest',
      summary: 'Search box suggestions: jobs, places and employers',
    },
    handler: async ({ db, req, input }) =>
      redactingSearchText(req, async () => privateJson(await suggest(db, input.q))),
  }),
);
