// PUT /api/v1/me/profile/{section}/order (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 9). The apiRoute options below are the contract; keep them.
import { reorderSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: reorderSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/profile/{section}/order',
    summary: "Reorder a section's entries",
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
