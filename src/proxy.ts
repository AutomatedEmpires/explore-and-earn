// Runs before every page and API request (Next.js 16 "proxy", formerly middleware):
// 1. Clerk reads the session.
// 2. routeForHost serves the operator console on the admin host and hides /admin elsewhere.
// 3. Signed-in users without an account type go to /onboarding, keeping the page they asked
//    for as returnTo when it stays on this site. This needs the Clerk session token customized
//    with `"metadata": "{{user.public_metadata}}"` (Clerk Dashboard > Sessions); until then the
//    claim is missing and nobody is redirected. The path is still forwarded (x-ee-path) so the
//    shell can keep it when it is the one that sends them to onboarding.
// 4. Every response gets a request id and the security headers, with a fresh CSP nonce that
//    is also passed to the app (x-nonce, and the CSP request header Next.js reads it from).
//
// Local dev without Clerk keys skips step 1 (and so 3), so pages that need no sign-in, like
// the design-system gallery, still work. Preview and prod require the keys (src/lib/env.ts).
import { clerkMiddleware, type ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { onboardingHref } from '@/app/onboarding/return-to';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import {
  buildSecurityHeaders,
  frontendApiFromPublishableKey,
  newNonce,
  storageOrigin,
} from '@/lib/security-headers';
import {
  isAdminHost,
  isViewAsWrite,
  onboardingState,
  routeForHost,
  shouldRedirectToOnboarding,
} from '@/server/host-routing';
import { REQUEST_ID_HEADER } from '@/server/request-context';

/** The shell reads this from the forwarded request when it, not the proxy, sends them on. */
const RETURN_PATH_HEADER = 'x-ee-path';

function requestReturnPath(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

async function handle(req: NextRequest, auth: ClerkMiddlewareAuth | null): Promise<NextResponse> {
  const env = getEnv();
  const host = req.headers.get('host') ?? req.nextUrl.host;
  const { pathname, search } = req.nextUrl;
  const onAdminHost = isAdminHost(host, env.ADMIN_HOST);

  // The proxy always assigns the id, so a client cannot choose what ends up in our logs.
  const requestId = newId();
  const nonce = newNonce();
  const security = buildSecurityHeaders({
    nonce,
    appEnv: env.APP_ENV,
    clerkFrontendApi: frontendApiFromPublishableKey(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    storageOrigin: storageOrigin(env),
  });

  const decorate = (res: NextResponse): NextResponse => {
    for (const [name, value] of Object.entries(security)) res.headers.set(name, value);
    res.headers.set(REQUEST_ID_HEADER, requestId);
    if (onAdminHost) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  };

  const route = routeForHost({ host, pathname, adminHost: env.ADMIN_HOST, appEnv: env.APP_ENV });
  if (route.action === 'notFound') {
    return decorate(
      new NextResponse('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    );
  }

  if (auth) {
    const { userId, sessionClaims } = await auth();
    const hasActor = Boolean(
      sessionClaims &&
        typeof sessionClaims === 'object' &&
        'act' in sessionClaims &&
        (sessionClaims as { act?: unknown }).act,
    );
    if (isViewAsWrite({ method: req.method, hasActor })) {
      return decorate(
        NextResponse.json(
          {
            error: {
              code: 'forbidden',
              message: 'View as is read-only',
              details: { reason: 'view_as_read_only' },
              requestId,
            },
          },
          { status: 403 },
        ),
      );
    }
    const redirect = shouldRedirectToOnboarding({
      signedIn: userId !== null,
      state: onboardingState(sessionClaims),
      pathname,
      isAdminHost: onAdminHost,
    });
    if (redirect) {
      const to = onboardingHref(requestReturnPath(pathname, search));
      return decorate(NextResponse.redirect(new URL(to, req.url)));
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(RETURN_PATH_HEADER, requestReturnPath(pathname, search));
  const csp = security['Content-Security-Policy'];
  if (csp) requestHeaders.set('Content-Security-Policy', csp);

  const res =
    route.action === 'rewrite'
      ? NextResponse.rewrite(new URL(`${route.to}${search}`, req.url), {
          request: { headers: requestHeaders },
        })
      : NextResponse.next({ request: { headers: requestHeaders } });
  return decorate(res);
}

const withClerk = clerkMiddleware((auth, req) => handle(req, auth));

let warnedNoClerk = false;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const env = getEnv();
  if (env.APP_ENV === 'dev' && !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (!warnedNoClerk) {
      warnedNoClerk = true;
      logger.warn('proxy: no Clerk keys, running without sign-in (dev only)', {
        fix: 'set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local',
      });
    }
    return handle(req, null);
  }
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files...
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // ...and always the API.
    '/(api|trpc)(.*)',
  ],
};
