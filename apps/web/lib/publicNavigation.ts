export type PublicViewerRole = "guest" | "seeker" | "host" | "admin";

export type AuthenticatedPublicViewerRole = Exclude<PublicViewerRole, "guest">;

export interface ViewerNavigationResponse {
  readonly role: AuthenticatedPublicViewerRole;
}

export type ClerkViewerState =
  | "guest"
  | "checking-auth"
  | "resolving"
  | "resolved"
  | "fallback";

export type ViewerRoleResolution =
  | {
      readonly userId: string;
      readonly role: null;
      readonly state: "resolving" | "fallback";
    }
  | {
      readonly userId: string;
      readonly role: AuthenticatedPublicViewerRole;
      readonly state: "resolved";
    };

export interface ClerkViewerSnapshot {
  readonly role: PublicViewerRole;
  readonly state: ClerkViewerState;
  readonly userId?: string;
}

export interface PublicRoleDestinations {
  readonly home: string;
  readonly profile: string;
  readonly notifications: string;
}

export const PUBLIC_ROLE_DESTINATIONS = {
  guest: {
    home: "/",
    profile: "/profile",
    notifications: "/notifications",
  },
  seeker: {
    home: "/",
    profile: "/profile",
    notifications: "/notifications",
  },
  host: {
    home: "/host/listings",
    profile: "/host/profile",
    notifications: "/host/notifications",
  },
  admin: {
    home: "/admin",
    profile: "/admin",
    notifications: "/admin/notifications",
  },
} as const satisfies Record<PublicViewerRole, PublicRoleDestinations>;

const AUTHENTICATED_PUBLIC_VIEWER_ROLES = new Set<AuthenticatedPublicViewerRole>([
  "seeker",
  "host",
  "admin",
]);

/** Validate the private navigation endpoint without trusting its JSON shape. */
export function isViewerNavigationResponse(
  value: unknown,
): value is ViewerNavigationResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.role === "string" &&
    AUTHENTICATED_PUBLIC_VIEWER_ROLES.has(
      record.role as AuthenticatedPublicViewerRole,
    )
  );
}

/** Pure production-auth state machine; testable without a Clerk browser. */
export function deriveClerkViewerSnapshot(
  auth: {
    readonly hydrated: boolean;
    readonly isLoaded: boolean;
    readonly isSignedIn?: boolean;
    readonly userId?: string | null;
  },
  resolution: ViewerRoleResolution | null,
): ClerkViewerSnapshot {
  if (!auth.hydrated) {
    return { role: "guest", state: "guest" };
  }
  if (!auth.isLoaded) {
    return { role: "guest", state: "checking-auth" };
  }

  const authenticatedUserId =
    auth.isSignedIn && auth.userId ? auth.userId : null;
  if (!authenticatedUserId) {
    return { role: "guest", state: "guest" };
  }

  const currentResolution =
    resolution?.userId === authenticatedUserId ? resolution : null;
  return {
    role: currentResolution?.role ?? "seeker",
    state: currentResolution?.state ?? "resolving",
    userId: authenticatedUserId,
  };
}

/** Reject a response that belongs to a signed-out or superseded Clerk user. */
export function isCurrentViewerRequest(
  activeUserId: string | null,
  requestUserId: string,
): boolean {
  return activeUserId === requestUserId;
}
