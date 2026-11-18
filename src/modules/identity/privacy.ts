import { stubPrivacyHandler } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('identity', [
  'users',
  'operators',
  'webhook_events',
]);
