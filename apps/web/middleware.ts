import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
