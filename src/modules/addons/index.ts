import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('addons', []);
export const retentionRules: RetentionRule[] = [];
