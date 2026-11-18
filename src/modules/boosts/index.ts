import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandler = stubPrivacyHandler('boosts', []);
export const retentionRules: RetentionRule[] = [];
