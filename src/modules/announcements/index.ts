import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('announcements', []);
export const retentionRules: RetentionRule[] = [];
