// The trust subject of a privacy exception. Approving its support item means "try again":
// the failed steps are reset and queued under new keys. Nothing else can be decided on it.
import { z } from 'zod';
import { registerSubjectHandlers } from '@/modules/trust';
import { retryRequest } from './erase';
import { PRIVACY_REQUEST_SUBJECT } from './requests';

const decision = z.object({ reviewItemId: z.uuid() });

/** Registered when the privacy module loads (engine.ts). */
export function registerPrivacySubjects(): void {
  registerSubjectHandlers(PRIVACY_REQUEST_SUBJECT, {
    approve: async (db, subjectId, data) => {
      const parsed = decision.safeParse(data);
      if (!parsed.success) throw new Error('privacy_request: the decision carries no review item');
      await retryRequest(db, subjectId, parsed.data.reviewItemId);
    },
  });
}
