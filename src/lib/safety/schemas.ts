// zod input schemas for every safety route (SP4 spec 5; plan Task 4). Client-safe.
import { z } from 'zod';
import {
  PARTY_TYPES,
  REPORT_SUBJECT_TYPES,
  SAFETY_LIMITS,
  SAFETY_REPORT_REASONS,
} from './constants';

/** POST /reports. A host reports `seeker_profile` by application id. */
export const reportSchema = z.object({
  subjectType: z.enum(REPORT_SUBJECT_TYPES),
  subjectId: z.uuid(),
  reason: z.enum(SAFETY_REPORT_REASONS),
  details: z.string().trim().max(SAFETY_LIMITS.detailsMax).optional(),
});

/** PUT /me/blocks. */
export const blockSchema = z.object({
  targetType: z.enum(PARTY_TYPES),
  targetId: z.uuid(),
  withdrawApplications: z.boolean().optional(),
});

/** DELETE /me/blocks/[type]/[id]. */
export const unblockParamsSchema = z.object({ type: z.enum(PARTY_TYPES), id: z.uuid() });

/** PUT · DELETE /me/mutes/[orgId]. */
export const orgIdParamSchema = z.object({ orgId: z.uuid() });

/** PUT /host/blocks: the host blocks an applicant by application id. */
export const hostBlockSchema = z.object({ applicationId: z.uuid() });

/** DELETE /host/blocks/[blockId]. */
export const blockIdParamSchema = z.object({ blockId: z.uuid() });
