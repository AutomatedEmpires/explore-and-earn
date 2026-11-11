// GET · PATCH /api/v1/me/profile (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 8). The apiRoute options below are the contract; keep them.
import { profilePatchSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/profile',
    summary: 'Read your profile',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const PATCH = apiRoute({
  auth: 'seeker',
  input: profilePatchSchema,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/me/profile',
    summary: 'Update your profile',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
