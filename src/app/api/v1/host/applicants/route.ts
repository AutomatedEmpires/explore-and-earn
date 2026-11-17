// GET /api/v1/host/applicants. The owner replaces the handler.
import { applicantsQuerySchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: applicantsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/applicants', summary: 'List applicants' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
