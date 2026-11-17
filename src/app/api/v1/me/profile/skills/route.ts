// PUT /api/v1/me/profile/skills (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { setSkills, skillsSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: skillsSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/profile/skills',
    summary: 'Replace your skills, in rank order',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return { skills: await setSkills(db, user.id, input.skills) };
  },
});
