// GET /api/v1/me/applications/{id}/resume.pdf (SP4 spec 5). The apiRoute options below are the contract.
// Renders the frozen snapshot and template, so a removed listing still downloads. FD-2: there is
// no upload mode; the employer receives this generated PDF, never an uploaded file.
import { unauthorized } from '@/lib/errors';
import { getReceipt } from '@/modules/applications';
import { idParamSchema, renderResumePdf, resumePdfResponse } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/applications/{id}/resume.pdf',
    summary: 'Download the resume you sent with an application',
  },
  handler: async ({ input, db, user }) => {
    if (!user) throw unauthorized();
    const receipt = await getReceipt(db, user.id, input.id);
    const { profile, resume } = receipt.snapshot;
    const bytes = await renderResumePdf(profile, resume.template, {
      creationDate: new Date(receipt.submittedAt),
    });
    return resumePdfResponse(bytes, profile);
  },
});
