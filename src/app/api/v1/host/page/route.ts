// GET /api/v1/host/page: the host page as its editor shows it (Owner or Admin): the live content,
// a held change and where that stands. PUT saves the whole page: a change that adds text waits
// on its check (`checking`) while the current page stays live.
import { unauthorized } from '@/lib/errors';
import { getHostPageForEditor, HostPageContentSchema, saveHostPage } from '@/modules/hostpages';
import { kickWorker } from '@/modules/jobs';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'hostpage.edit');
    return getHostPageForEditor(db, host);
  },
});

export const PUT = apiRoute({
  auth: 'host',
  input: HostPageContentSchema,
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'hostpage.edit');
    const result = await saveHostPage(db, host, input);
    kickWorker();
    return result;
  },
});
