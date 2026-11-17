// GET /api/v1/host/applications/{id}/resume.pdf (SP4 spec 5). W0 contract stub: W2 implements the handler
// (Task 14). The apiRoute options below are the contract; keep them.
//
// host* (SP4 plan): the role must be owner, admin or recruiter (403, reason
// role_not_allowed), and canAccessListing must pass (404). Billing members get 403.
import { idParamSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/host/applications/{id}/resume.pdf',
    summary: "Download an applicant's resume",
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
