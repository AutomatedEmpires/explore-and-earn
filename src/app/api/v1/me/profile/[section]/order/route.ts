// PUT /api/v1/me/profile/{section}/order (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { reorderEntries, reorderSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: reorderSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/profile/{section}/order',
    summary: "Reorder a section's entries",
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await reorderEntries(db, user.id, input.section, input.ids);
  },
});
