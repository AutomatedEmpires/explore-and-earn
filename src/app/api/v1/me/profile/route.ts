// GET · PATCH /api/v1/me/profile (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { getOwnProfile, profilePatchSchema, updateProfile } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/profile',
    summary: 'Read your profile',
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    return getOwnProfile(db, user.id);
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
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return updateProfile(db, user.id, input);
  },
});
