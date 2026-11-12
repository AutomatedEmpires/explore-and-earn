// PUT /api/v1/me/applications/{id}/additional-step (SP4 spec 5 and 8.5): the seeker ticks or
// clears "I completed the employer's form" on their own application and gets the receipt back.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { additionalStepSchema, setAdditionalStep } from '@/modules/applications';
import { privateJson } from '@/server/viewer';

export const PUT = apiRoute({
  auth: 'seeker',
  input: additionalStepSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/applications/{id}/additional-step',
    summary: "Mark the employer's form done or not done",
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(
      await setAdditionalStep(db, {
        applicationId: input.id,
        seekerUserId: user.id,
        completed: input.completed,
      }),
    );
  },
});
