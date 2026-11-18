import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('community', []);
export const retentionRules: RetentionRule[] = [];
