import type { DbOrTx } from '@/lib/db';
import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('promote', []);
export const retentionRules: RetentionRule[] = [];

/** SP6 stops an org's promotions. Until that module lands, there is nothing to stop. */
export async function stopPromotionsForOrg(_db: DbOrTx, _orgId: string): Promise<void> {}
