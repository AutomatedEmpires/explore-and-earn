import { NextResponse } from "next/server";
import { hasHostProfile } from "@explore-and-earn/db";

import { isAdminUserId } from "../../../../lib/admin";
import { optionalAuth } from "../../../../lib/optionalAuth";
import type {
  AuthenticatedPublicViewerRole,
  ViewerNavigationResponse,
} from "../../../../lib/publicNavigation";

export const dynamic = "force-dynamic";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

function roleResponse(role: AuthenticatedPublicViewerRole): NextResponse {
  return NextResponse.json(
    { role } satisfies ViewerNavigationResponse,
    { headers: PRIVATE_RESPONSE_HEADERS },
  );
}

function errorResponse(status: 401 | 503, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

/**
 * Return the authenticated visitor's presentation role for shared public
 * navigation. Authorization for protected routes remains in their own server
 * gates; this endpoint is deliberately only a minimal UI hint.
 */
export async function GET(): Promise<NextResponse> {
  const { userId, getToken } = await optionalAuth();
  if (!userId) return errorResponse(401, "unauthorized");

  // The explicit founder allow-list wins and avoids an unnecessary token/DB
  // lookup. No Clerk metadata or caller-supplied role participates here.
  if (isAdminUserId(userId)) return roleResponse("admin");

  try {
    if (!getToken) return errorResponse(503, "navigation_unavailable");
    const token = await getToken();
    if (!token) return errorResponse(503, "navigation_unavailable");

    return roleResponse(
      (await hasHostProfile(token, userId)) ? "host" : "seeker",
    );
  } catch {
    return errorResponse(503, "navigation_unavailable");
  }
}
