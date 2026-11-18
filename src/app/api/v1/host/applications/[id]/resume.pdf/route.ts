// GET /api/v1/host/applications/{id}/resume.pdf (SP4 spec 5). The apiRoute options below are the contract.
//
// host* (SP4 plan): authorizeHostApplication requires owner, admin or recruiter (403, reason
// role_not_allowed) and canAccessListing (404). Billing members get 403. A seeker who blocked
// the org is not_found. FD-2: the PDF is rendered from the frozen snapshot, never an upload.
// A host whose verification is running, needs_review, needs_info or failed gets 409
// `verification_<status>` before anything is read, rendered or audited (legal review 7.1).
import { forbidden, notFound } from '@/lib/errors';
import { authorizeHostApplication, getSnapshot } from '@/modules/applications';
import { record } from '@/modules/audit';
import { idParamSchema, renderResumePdf, resumePdfResponse } from '@/modules/profiles';
import { apiRoute } from '@/server/api';
import { requireVerifiedHost } from '../../_shared/verified-host';

export const GET = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/host/applications/{id}/resume.pdf',
    summary: "Download an applicant's resume",
  },
  handler: async ({ input, db, host }) => {
    if (!host) throw forbidden();
    await requireVerifiedHost(db, host.orgId);
    const ref = await authorizeHostApplication(db, host, input.id);
    const snapshot = await getSnapshot(db, {
      orgId: ref.orgId,
      applicationId: ref.applicationId,
    });
    if (!snapshot) throw notFound('Application not found');
    const bytes = await renderResumePdf(snapshot.profile, snapshot.resume.template, {
      creationDate: ref.submittedAt,
    });
    await record(db, {
      actorType: 'user',
      actorId: host.user.id,
      orgId: ref.orgId,
      action: 'applications.resume_downloaded',
      subjectType: 'application',
      subjectId: ref.applicationId,
    });
    return resumePdfResponse(bytes, snapshot.profile);
  },
});
