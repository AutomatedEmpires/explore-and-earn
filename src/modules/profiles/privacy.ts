// The profiles module's SP8 registration (SP4 spec 10). Profile data is held only by an `all` hold.
// FD-2: an uploaded resume is not a profile column, so mediaColumns stay the import source and
// the avatar and cover.
import { eq } from 'drizzle-orm';
import type { ExportPart, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { getOwnProfile } from './profile';
import { seekerProfiles, seekerReveals } from './schema';

const emptyExport = (): ExportPart => ({
  records: {
    profile: [],
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    consent: [],
  },
  files: [],
});

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
    // app.resume_imports is not migrated yet (drizzle/3050_profiles.sql is a shell). The media
    // retention rules refuse to run while a declared column does not exist, so the migration
    // that creates the table declares resume_imports.source_media_id here; the coverage test
    // fails until it does.
  ],
  async exportData(db, subject) {
    if (subject.kind !== 'user') return emptyExport();
    const view = await getOwnProfile(db, subject.userId);
    if (view.version === 0) return emptyExport();
    return {
      records: {
        profile: [
          {
            identity: view.identity,
            preferences: view.preferences,
            workAuthorization: view.workAuthorization,
            visibility: view.visibility,
            resume: view.resume,
            languages: view.languages,
            portfolioLinks: view.portfolioLinks,
          },
        ],
        experience: view.experience,
        education: view.education,
        skills: view.skills,
        certifications: view.certifications,
        consent: view.aiImportConsent ? [view.aiImportConsent] : [],
      },
      files: [],
    };
  },
  async erase(tx, subject, ctx) {
    if (subject.kind !== 'user') return { erased: 0, retained: [] };
    if (ctx.holds.includes('all')) {
      return {
        erased: 0,
        retained: [{ table: 'seeker_profiles', reason: 'legal_hold', until: null }],
      };
    }
    const profiles = await tx
      .delete(seekerProfiles)
      .where(eq(seekerProfiles.userId, subject.userId))
      .returning({ userId: seekerProfiles.userId });
    const reveals = await tx
      .delete(seekerReveals)
      .where(eq(seekerReveals.seekerUserId, subject.userId))
      .returning({ id: seekerReveals.id });
    return { erased: profiles.length + reveals.length, retained: [] };
  },
};

export const retentionRules: RetentionRule[] = [];
