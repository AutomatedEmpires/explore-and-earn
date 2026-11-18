import { stubPrivacyHandler } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('jobs', ['outbox', 'schedule_runs']);
