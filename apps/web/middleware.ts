import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/search",
  "/listing/(.*)",
  "/host/(.*)", // Public host profiles (/host/{id}) + layout-gated authed routes
  "/sign-in/(.*)",
  "/sign-up/(.*)",
  "/api/webhooks/(.*)",
  "/api/health",
  "/terms",
  "/privacy",
  "/cookies",
  "/about",
  "/sitemap.xml",
  "/robots.txt",
  // Seeker onboarding is auth-required, but excluded from the post-auth gate so
  // the (seeker) layout's onboarding redirect never loops back on itself.
  "/onboarding",
  "/onboarding/(.*)",
]);

const hasClerkMiddlewareConfig =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

const isPreviewDeployment = process.env.VERCEL_ENV === "preview";

if (process.env.NODE_ENV === "production" && !hasClerkMiddlewareConfig && !isPreviewDeployment) {
  throw new Error(
    "Clerk env vars (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY) must be set in production.",
  );
}

export default hasClerkMiddlewareConfig
  ? clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    })
  : function authFallbackMiddleware(request: Request) {
      if (isPreviewDeployment) {
        return NextResponse.next();
      }

      if (!isPublicRoute(request as Parameters<typeof isPublicRoute>[0])) {
        return new NextResponse("Unauthorized — Clerk not configured", {
          status: 401,
        });
      }

      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
