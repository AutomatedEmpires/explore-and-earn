// GET · PUT /api/v1/host/blocks (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
//
// PUT is host* (SP4 plan): the role must be owner, admin or recruiter (403, reason
// role_not_allowed), and canAccessListing must pass for the application's listing (404).
// GET is owner or admin only (spec 5). Billing members get 403.
import { hostBlockSchema } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/blocks',
    summary: 'List the applicants your organization blocked',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const PUT = apiRoute({
  auth: 'host',
  input: hostBlockSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/host/blocks',
    summary: 'Block an applicant',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
