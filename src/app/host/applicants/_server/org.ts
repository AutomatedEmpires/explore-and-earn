// The organization's name for flow D's screens (shown above the title on a phone). Server-only.
import 'server-only';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getOrgSummaries } from '@/modules/orgs';

/** Never fails the page: a failed lookup shows a neutral name and is logged. */
export async function orgName(orgId: string): Promise<string> {
  try {
    const org = (await getOrgSummaries(getDb(), [orgId])).get(orgId);
    return org?.name ?? 'Your organization';
  } catch (err) {
    logger.warn('flow D: org name failed', { orgId, err });
    return 'Your organization';
  }
}
