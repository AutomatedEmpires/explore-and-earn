// The landing module's SP8 registration (SP8 section 3). landing_pages holds operator-written
// public copy, so there is nothing to export; erasing a user only forgets that they saved a page
// (the landing.copy_saved audit events keep the history). hero_media_id is declared so SP8's
// orphan sweep never deletes a hero image in use.
import { eq } from 'drizzle-orm';
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { landingPages } from './schema';

export const privacyHandler: PrivacyHandler = {
  module: 'landing',
  tables: ['landing_pages'],
  mediaColumns: [{ table: 'landing_pages', column: 'hero_media_id', array: false }],

  async exportData() {
    return { records: {}, files: [] };
  },

  async erase(tx, s, ctx) {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    if (ctx.holds.includes('all')) {
      const held = await tx
        .select({ key: landingPages.key })
        .from(landingPages)
        .where(eq(landingPages.updatedBy, s.userId))
        .limit(1);
      return {
        erased: 0,
        retained:
          held.length > 0 ? [{ table: 'landing_pages', reason: 'legal_hold', until: null }] : [],
      };
    }
    const erased = await tx
      .update(landingPages)
      .set({ updatedBy: null })
      .where(eq(landingPages.updatedBy, s.userId))
      .returning({ key: landingPages.key });
    return { erased: erased.length, retained: [] };
  },
};

export const retentionRules: RetentionRule[] = [];
