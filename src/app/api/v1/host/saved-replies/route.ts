// GET/POST /api/v1/host/saved-replies. The owner replaces the handler.
import { savedReplySchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: { method: 'GET', path: '/api/v1/host/saved-replies', summary: 'List saved replies' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const POST = apiRoute({
  auth: 'host',
  input: savedReplySchema,
  openapi: { method: 'POST', path: '/api/v1/host/saved-replies', summary: 'Create a saved reply' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
