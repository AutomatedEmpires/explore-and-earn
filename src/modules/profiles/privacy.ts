// The profiles module's SP8 registration (SP4 spec 10). W0 stub: W1 implements export and erase
// (Task 12). The table and media column lists are final.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'profiles',
  tables: [
    'seeker_profiles',
    'seeker_experiences',
    'seeker_education',
    'seeker_skills',
    'seeker_certifications',
    'seeker_reveals',
    'resume_imports',
  ],
  mediaColumns: [
    { table: 'seeker_profiles', column: 'avatar_media_id', array: false },
    { table: 'seeker_profiles', column: 'cover_media_id', array: false },
    { table: 'resume_imports', column: 'source_media_id', array: false },
  ],
  async exportData() {
    throw new Error('not implemented: profiles privacyHandler.exportData');
  },
  async erase() {
    throw new Error('not implemented: profiles privacyHandler.erase');
  },
};

export const retentionRules: RetentionRule[] = [];
