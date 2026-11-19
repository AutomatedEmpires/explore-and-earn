// Settings are operator configuration. The only personal link is who last changed a value.
import { eq } from 'drizzle-orm';
import type { PrivacyHandler } from '@/modules/privacy';
import { settings } from './schema';

export const privacyHandler: PrivacyHandler = {
  module: 'settings',
  tables: ['settings'],
  async exportData() {
    return { records: {}, files: [] };
  },
  async erase(tx, s, ctx) {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    if (ctx.holds.includes('all')) {
      const [row] = await tx
        .select({ key: settings.key })
        .from(settings)
        .where(eq(settings.updatedBy, s.userId))
        .limit(1);
      return {
        erased: 0,
        retained: row ? [{ table: 'settings', reason: 'legal_hold', until: null }] : [],
      };
    }
    const cleared = await tx
      .update(settings)
      .set({ updatedBy: null })
      .where(eq(settings.updatedBy, s.userId))
      .returning({ key: settings.key });
    return { erased: cleared.length, retained: [] };
  },
};
