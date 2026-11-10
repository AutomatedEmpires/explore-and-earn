// Drizzle tables for the orgs module (created in drizzle/0100_identity.sql, extended by
// drizzle/1000_orgs.sql and drizzle/1060_orgs_founding_cohort.sql). Only this module reads or
// writes them; other code goes through `@/modules/orgs`.
import { boolean, pgSchema, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ORG_ROLES = ['owner', 'admin', 'recruiter', 'billing'] as const;
export const ORG_STATUSES = ['active', 'suspended', 'banned'] as const;
export const VERIFICATION_STATUSES = [
  'unverified',
  'running',
  'verified',
  'needs_review',
  'needs_info',
  'failed',
] as const;
export const RECRUITER_SCOPES = ['all', 'assigned'] as const;
export const INVITATION_ROLES = ['admin', 'recruiter', 'billing'] as const;
export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const;

export const organizations = app.table('organizations', {
  id: uuid('id').primaryKey(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** References app.users(id). */
  ownerUserId: uuid('owner_user_id'),
  deletedAt: ts('deleted_at'),
  /** Clerk `updated_at` of the snapshot this row was last written from; null on placeholders. */
  clerkUpdatedAt: ts('clerk_updated_at'),
  status: text('status', { enum: ORG_STATUSES }).notNull().default('active'),
  /** https only. */
  websiteUrl: text('website_url'),
  requireRecruiterApproval: boolean('require_recruiter_approval').notNull().default(false),
  /** References app.locations(id) (foreign key added in 1100). */
  primaryLocationId: uuid('primary_location_id'),
  verificationStatus: text('verification_status', { enum: VERIFICATION_STATUSES })
    .notNull()
    .default('unverified'),
  verifiedAt: ts('verified_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const orgMemberships = app.table(
  'org_memberships',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id').notNull(),
    /** References app.users(id). */
    userId: uuid('user_id').notNull(),
    role: text('role', { enum: ORG_ROLES }).notNull(),
    /** Set when the member was removed; the row is kept so reordered events can't revive it. */
    deletedAt: ts('deleted_at'),
    clerkUpdatedAt: ts('clerk_updated_at'),
    recruiterScope: text('recruiter_scope', { enum: RECRUITER_SCOPES }).notNull().default('all'),
    /** References app.users(id). */
    invitedBy: uuid('invited_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('org_memberships_org_id_user_id_key').on(t.orgId, t.userId)],
);

/** An `assigned` Recruiter's listings and locations; exactly one target per row. */
export const memberAssignments = app.table(
  'member_assignments',
  {
    id: uuid('id').primaryKey(),
    membershipId: uuid('membership_id').notNull(),
    /** References app.listings(id) (foreign key added in 1200). */
    listingId: uuid('listing_id'),
    /** References app.locations(id) (foreign key added in 1100). */
    locationId: uuid('location_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('member_assignments_listing_key').on(t.membershipId, t.listingId),
    unique('member_assignments_location_key').on(t.membershipId, t.locationId),
  ],
);

/**
 * Team invitations. The token is stored only as its sha256 hash, set when the invitation email
 * is sent (null until then; drizzle/1050_orgs_invitations.sql).
 */
export const orgInvitations = app.table('org_invitations', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  /** Lowercased. */
  email: text('email').notNull(),
  role: text('role', { enum: INVITATION_ROLES }).notNull(),
  recruiterScope: text('recruiter_scope', { enum: RECRUITER_SCOPES }).notNull().default('all'),
  assignListingIds: uuid('assign_listing_ids').array().notNull().default([]),
  assignLocationIds: uuid('assign_location_ids').array().notNull().default([]),
  tokenHash: text('token_hash').unique(),
  status: text('status', { enum: INVITATION_STATUSES }).notNull().default('pending'),
  expiresAt: ts('expires_at').notNull(),
  invitedBy: uuid('invited_by'),
  acceptedUserId: uuid('accepted_user_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Every slug an organization has used; written by the app.org_slugs_track() trigger. */
export const orgSlugs = app.table('org_slugs', {
  slug: text('slug').primaryKey(),
  orgId: uuid('org_id').notNull(),
  retiredAt: ts('retired_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/**
 * FD-7: the first 100 host organizations, numbered 1-100 in signup order. Written once, when the
 * app records an organization's Owner (./founding.ts); numbers are never reissued. org_id is null
 * only after the organization row was hard-deleted, which keeps its number taken.
 */
export const foundingCohort = app.table('founding_cohort', {
  foundingNumber: smallint('founding_number').primaryKey(),
  orgId: uuid('org_id').unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
