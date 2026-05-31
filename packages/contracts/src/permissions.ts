export const PERMISSION_SCOPES = [
  "owner",
  "owner_team",
  "contextual",
  "admin_internal",
  "sensitive"
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

// TODO: Mirror the Permission, Visibility & RLS Registry into machine-readable
// permission/action maps.