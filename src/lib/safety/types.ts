// The safety contract types (SP4 spec 3.1, plan Task 4), shared by @/modules/safety and client
// code. Client-safe: type-only imports.
import type { DbOrTx } from '@/lib/db';

// --- Spec 3.1 ----------------------------------------------------------------------------------

export type Party = { type: 'user'; id: string } | { type: 'org'; id: string };
export type ReportSubjectType =
  'listing' | 'org' | 'seeker_profile' | 'message' | 'thread' | 'community_post' | 'announcement';
export type SafetyReportReason =
  | 'scam'
  | 'asks_for_money'
  | 'discrimination'
  | 'harassment'
  | 'not_as_described'
  | 'inappropriate'
  | 'spam'
  | 'child_safety'
  | 'other';

// --- Plan Task 4 additions ---------------------------------------------------------------------

export type BlockRow = { blockId: string; by: Party; target: Party; createdAt: Date };

// --- W0 engineering decisions ------------------------------------------------------------------

/** `report`'s input (spec 3.2). A host reports `seeker_profile` by application id. */
export type ReportInput = {
  subjectType: ReportSubjectType;
  subjectId: string;
  reason: SafetyReportReason;
  details?: string;
};

/** Who filed a report: a user, and the org they reported for when they are a host member. */
export type Reporter = { userId: string; orgId?: string };

/** How a report subject maps onto the trust module (spec 3.2 `registerReportSubject`). */
export type ReportSubjectRegistration = {
  /** The trust subject type whose handlers carry out the decision. */
  trustSubjectType: string;
  exists(db: DbOrTx, id: string): Promise<boolean>;
};

/** One report, for the console's Safety tab (SP8). */
export type ReportSummary = {
  reportId: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  reason: SafetyReportReason;
  details: string;
  reporterUserId: string | null;
  reviewItemId: string | null;
  createdAt: Date;
};

/** One seeker's relationship with an org (spec 3.2 `getRelationships`). */
export type Relationship = { seekerUserId: string; blocked: boolean; muted: boolean };

/** A user's blocks in both directions and their muted orgs (spec 3.2 `getBlockSet`). */
export type BlockSet = { userIds: string[]; orgIds: string[]; mutedOrgIds: string[] };
