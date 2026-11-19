// GET /api/v1/hosts/[slug]: a public host page. 404 when the page isn't public; a retired slug
// answers 301 with the current address (an absolute URL: Response.redirect rejects relative ones,
// and Next.js's permanentRedirect answers 308; SP2 plan decision 15). Signed-in viewers also
// learn whether they follow the host.
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { isAppError, notFound } from '@/lib/errors';
import { resolveHostPage } from '@/modules/hostpages';
import { apiRoute } from '@/server/api';
import { requireUser } from '@/server/guards';

/** The signed-in viewer's id, or null for a guest. */
async function viewerId(): Promise<string | null> {
  try {
    return (await requireUser()).id;
  } catch (err) {
    if (isAppError(err) && err.code === 'unauthorized') return null;
    throw err;
  }
}

export const GET = apiRoute({
  auth: 'none',
  input: z.object({ slug: z.string().min(1).max(100) }),
  handler: async ({ db, input }) => {
    const result = await resolveHostPage(db, input.slug, { userId: await viewerId() });
    if (result.kind === 'not_found') throw notFound('Host page not found');
    if (result.kind === 'redirect') {
      const location = new URL(
        `/api/v1/hosts/${encodeURIComponent(result.slug)}`,
        getEnv().APP_URL,
      ).toString();
      return new Response(null, { status: 301, headers: { location } });
    }
    return result.page;
  },
});
