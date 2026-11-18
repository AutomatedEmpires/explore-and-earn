// POST /api/v1/reports (SP4 spec 5 and 8.7): report a listing, a host, a profile or a message.
// At most 20 a day per user. 201 `{ reportId }`; a repeat on the same subject within 24 hours
// returns the first report.
//
// A seeker may report any subject type. A host member may report only `seeker_profile`,
// `message` and `thread` (403 `not_allowed` otherwise), always for their org. A host reports an
// applicant by application id: authorizeHostApplication resolves it to the seeker, with the
// host* rules (role, org and listing scope; a seeker who blocked the org is not_found).
// Analytics carry the subject type and reason only, and only for a new report.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { track } from '@/lib/analytics';
import { forbidden, unauthorized } from '@/lib/errors';
import { authorizeHostApplication } from '@/modules/applications';
import {
  RATE_LIMITS,
  report,
  reportSchema,
  type Reporter,
  type ReportSubjectType,
} from '@/modules/safety';
import { requireHost } from '@/server/guards';
import { privateJson } from '@/server/viewer';

const HOST_SUBJECTS: readonly ReportSubjectType[] = ['seeker_profile', 'message', 'thread'];

export const POST = apiRoute({
  auth: 'user',
  input: reportSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.reports.key}:${c.user?.id}`,
    limit: RATE_LIMITS.reports.limit,
    windowSec: RATE_LIMITS.reports.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/reports',
    summary: 'Report a listing, host, profile or message',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    let reporter: Reporter = { userId: user.id };
    let subjectId = input.subjectId;
    if (user.accountType === 'host') {
      if (!HOST_SUBJECTS.includes(input.subjectType)) {
        throw forbidden('Hosts can report applicants and messages.', { reason: 'not_allowed' });
      }
      const host = await requireHost();
      reporter = { userId: user.id, orgId: host.orgId };
      if (input.subjectType === 'seeker_profile') {
        subjectId = (await authorizeHostApplication(db, host, input.subjectId)).seekerUserId;
      }
    }
    const result = await report(db, reporter, { ...input, subjectId });
    if (result.created) {
      // Ids and enums only (spec 10).
      track('report_created', { subjectType: input.subjectType, reason: input.reason }, user.id);
    }
    return privateJson({ reportId: result.reportId }, { status: 201 });
  },
});
