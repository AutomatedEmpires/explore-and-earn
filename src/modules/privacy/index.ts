// Public API of the privacy module: SP8 section 3's registration types, types only. SP3 W0 lands
// this file because SP8 has not yet (the same file SP4's W0 would create); SP8 W0 owns it from
// here and adds the registry, export, deletion and retention sweep.
//
// Every module's index exports `privacyHandler: PrivacyHandler` and
// `retentionRules: RetentionRule[]`; src/server/privacy-registry.ts (SP8) collects them.
import type { DbOrTx, Db, Tx } from '@/lib/db';

export type PrivacySubject = { kind: 'user'; userId: string } | { kind: 'org'; orgId: string };

export type HoldScope = 'all' | 'applications' | 'messages' | 'reports' | 'billing';

export type RetainReason = 'shared_record' | 'safety' | 'legal_obligation' | 'legal_hold' | 'audit';

/** A column holding app.media ids, so the orphan sweep never deletes a file still in use. */
export type MediaColumnRef = { table: string; column: string; array: boolean };

export type ExportPart = {
  /** File name (no extension) -> rows, minimized. */
  records: Record<string, unknown[]>;
  /** Copied to files/<module>/<name>. */
  files: { mediaId: string; name: string }[];
};

export type EraseResult = {
  erased: number;
  /** `until` is an ISO date. */
  retained: { table: string; reason: RetainReason; until: string | null }[];
};

export interface PrivacyHandler {
  module: string;
  /** Every app table the module owns (bare names, without the `app.` schema). */
  tables: readonly string[];
  /** Columns holding app.media ids (orphan sweep). */
  mediaColumns?: readonly MediaColumnRef[];
  exportData(db: DbOrTx, s: PrivacySubject): Promise<ExportPart>;
  erase(
    tx: Tx,
    s: PrivacySubject,
    ctx: { requestId: string; now: Date; holds: HoldScope[] },
  ): Promise<EraseResult>;
}

export interface RetentionRule {
  /** '<module>.<what>', unique. */
  key: string;
  /** Shown in the console and generated into the privacy policy. */
  description: string;
  /** Deletes at most `limit` rows. */
  run(db: Db, now: Date, limit: number): Promise<{ deleted: number }>;
}
