// GET /api/v1/team/invitations/[token]: what the join page shows before anyone signs in. The
// invitee's email is masked (ma***@kettle.com). 404 for an unknown, revoked or accepted token;
// an expired invitation is returned with its past `expiresAt`.
import { z } from 'zod';
import { notFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getHostIdentities } from '@/modules/hostpages';
import { getMediaUrl, getStorage } from '@/modules/media';
import { INVITATION_ROLES, previewInvitation } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const output = z.object({
  orgName: z.string(),
  logoUrl: z.string().nullable(),
  role: z.enum(INVITATION_ROLES),
  expiresAt: z.iso.datetime(),
  emailHint: z.string(),
});

const ANONYMOUS = { userId: '', orgIds: [], isOperator: false };

export const GET = apiRoute({
  auth: 'none',
  input: z.object({ token: z.string().min(1).max(200) }),
  openapi: {
    method: 'GET',
    path: '/api/v1/team/invitations/{token}',
    summary: 'Preview a team invitation (organization, role, expiry and a masked email)',
    output,
  },
  handler: async ({ db, input }) => {
    const preview = await previewInvitation(db, input.token);
    if (!preview) throw notFound('Invitation not found');

    // The logo is decoration: without it the join page still works.
    let logoUrl: string | null = null;
    try {
      const identity = (await getHostIdentities(db, [preview.orgId])).get(preview.orgId);
      if (identity?.logoMediaId) {
        logoUrl = await getMediaUrl(db, getStorage(), ANONYMOUS, identity.logoMediaId, 320);
      }
    } catch (err) {
      logger.warn('Invitation preview: the organization logo is unavailable', { err });
    }

    return {
      orgName: preview.orgName,
      logoUrl,
      role: preview.role,
      expiresAt: preview.expiresAt.toISOString(),
      emailHint: preview.emailHint,
    };
  },
});
