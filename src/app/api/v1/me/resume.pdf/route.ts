// GET /api/v1/me/resume.pdf (SP4 spec 5). The apiRoute options below are the contract; keep them.
// FD-2: the resume is always the generated template. Work authorization stays off the live PDF.
import { unauthorized } from '@/lib/errors';
import {
  buildProfileSnapshot,
  renderResumePdf,
  resumePdfResponse,
  resumeTemplateQuerySchema,
} from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: resumeTemplateQuerySchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/resume.pdf',
    summary: 'Download your resume as a PDF',
  },
  handler: async ({ input, db, user }) => {
    if (!user) throw unauthorized();
    const snapshot = await buildProfileSnapshot(db, user.id, { includeWorkAuthorization: false });
    const template = input.template === 'compact' ? 'compact@1' : 'classic@1';
    const bytes = await renderResumePdf(snapshot, template);
    return resumePdfResponse(bytes, snapshot);
  },
});
