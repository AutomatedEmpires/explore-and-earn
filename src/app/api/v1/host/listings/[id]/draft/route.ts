// PATCH /api/v1/host/listings/{id}/draft: replace one builder section of the draft.
// Body { section, baseVersion, data, confirmedFields? }, where `data` holds the section's
// content keys (basics -> { basics }, where_when -> { where, when }).
// -> { draftVersion, sectionVersions, checklist }. 409 `section_conflict` returns the server's
// copy of that section in `details.data`.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { BUILDER_SECTIONS, patchDraft } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({
  id: z.uuid(),
  section: z.enum(BUILDER_SECTIONS),
  baseVersion: z.number().int().min(0),
  data: z.record(z.string(), z.unknown()),
  confirmedFields: z.array(z.string().max(200)).max(200).optional(),
});

export const PATCH = apiRoute({
  auth: 'host',
  input,
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    const result = await patchDraft(db, host, input.id, {
      section: input.section,
      baseVersion: input.baseVersion,
      data: input.data,
      confirmedFields: input.confirmedFields,
    });
    // A newly set housing or meal photo queued its slot check.
    kickWorker();
    return result;
  },
});
