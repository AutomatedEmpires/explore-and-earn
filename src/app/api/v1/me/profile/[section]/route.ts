// POST /api/v1/me/profile/{section} (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { addEntry, entryCreateSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: entryCreateSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/profile/{section}',
    summary: 'Add an experience, education or certification entry',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return addEntry(db, user.id, input.section, input);
  },
});
