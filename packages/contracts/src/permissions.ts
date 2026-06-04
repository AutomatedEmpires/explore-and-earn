// Permission, Visibility & RLS Registry — V1 Access Rules (contract mirror)
// MIRROR of the Notion "Permission, Visibility & RLS Registry" (source of truth)
// and the LOCKED Backend Ratification Record (DR-B5). Do not diverge (G13/G14).
// Core rule: frontend locks are UX only — server-side authorization + Postgres
// RLS enforce truth.

/* ----------------------------------------------------------- Visibility classes */
// Existing in-file source (preserved). These are the access *scopes* used by
// row/field visibility rules.
export const PERMISSION_SCOPES = [
  "owner",
  "owner_team",
  "contextual",
  "admin_internal",
  "sensitive",
] as const
export type PermissionScope = (typeof PERMISSION_SCOPES)[number]

// Full registry visibility classes (superset incl. public/authenticated).
export const VISIBILITY_CLASSES = [
  "public",
  "authenticated",
  "owner",
  "owner_team",
  "contextual",
  "admin_internal",
  "sensitive",
] as const
export type VisibilityClass = (typeof VISIBILITY_CLASSES)[number]

// `contextual` must always resolve to one of these named contexts — never used bare.
export const ACCESS_CONTEXTS = [
  "application",
  "invite",
  "offer",
  "matched_bucket",
  "accepted_active_application",
  "dispute",
  "report",
  "moderation",
  "support",
] as const
export type AccessContext = (typeof ACCESS_CONTEXTS)[number]

/* ----------------------------------------------------------- Host team roles */
// DR-B5 (LOCKED 2026-06-02): canonical host team role vocabulary. Legacy names
// (recruiter/listing_manager/marketing) are retired and map forward.
export const HOST_TEAM_ROLES = [
  "owner",
  "admin",
  "hiring_manager",
  "analyst",
  "billing",
  "viewer",
] as const
export type HostTeamRole = (typeof HOST_TEAM_ROLES)[number]

// Forward map for migrating any legacy role_preset values.
export const LEGACY_HOST_ROLE_MAP = {
  recruiter: "hiring_manager",
  listing_manager: "hiring_manager",
  marketing: "analyst",
} as const satisfies Record<string, HostTeamRole>

/* ----------------------------------------------------------- Admin sub-roles */
export const ADMIN_SUB_ROLES = [
  "super_admin",
  "trust_safety_admin",
  "billing_admin",
  "verification_admin",
  "support_admin",
  "content_admin",
  "read_only_admin",
] as const
export type AdminSubRole = (typeof ADMIN_SUB_ROLES)[number]

/* ----------------------------------------------------------- Host actions */
// Capability actions enforced server-side via requireEntitlement(scope, action).
export const HOST_ACTIONS = [
  "view_dashboard",
  "view_analytics",
  "edit_profile",
  "submit_attestation",
  "manage_listings",
  "manage_applicants",
  "send_invites",
  "make_offers",
  "message_seekers",
  "manage_scheduling",
  "manage_billing",
  "manage_team",
] as const
export type HostAction = (typeof HOST_ACTIONS)[number]

// Action -> allowed host team roles. `owner` implicitly holds every capability;
// it is listed explicitly for clarity. Derived from the registry role table.
export const HOST_ACTION_ROLES = {
  view_dashboard: ["owner", "admin", "hiring_manager", "analyst", "billing", "viewer"],
  view_analytics: ["owner", "admin", "analyst"],
  edit_profile: ["owner", "admin"],
  submit_attestation: ["owner", "admin"],
  manage_listings: ["owner", "admin", "hiring_manager"],
  manage_applicants: ["owner", "admin", "hiring_manager"],
  send_invites: ["owner", "admin", "hiring_manager"],
  make_offers: ["owner", "admin", "hiring_manager"],
  message_seekers: ["owner", "admin", "hiring_manager"],
  manage_scheduling: ["owner", "admin", "hiring_manager"],
  manage_billing: ["owner", "billing"],
  manage_team: ["owner"],
} as const satisfies Record<HostAction, ReadonlyArray<HostTeamRole>>

/** Whether a host team role is permitted to perform an action. */
export function hostRoleCan(role: HostTeamRole, action: HostAction): boolean {
  return (HOST_ACTION_ROLES[action] as ReadonlyArray<HostTeamRole>).includes(role)
}
