import { stubPrivacyHandler } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('trust', [
  'trust_checks',
  'review_items',
  'review_notes',
  'review_actions',
]);
