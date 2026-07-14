import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { isDevBenchEnabled } from "../../../lib/devBench";
import { readDevRole } from "../../../lib/devBench/server";
import { optionalAuth } from "../../../lib/optionalAuth";

/**
 * Auth gate for the host-onboarding lane.
 *
 * The middleware public matcher includes "/host/(.*)" for public host
 * profiles (/host/{id}), which also lets anonymous requests reach
 * /host/onboarding — so Clerk's auth.protect() never runs here and the
 * onboarding form was server-rendered to signed-out visitors, who could
 * fill it in only to be rejected by the server action. This layout closes
 * that gap the same way (host)/layout.tsx gates the dashboard, redirecting
 * guests into sign-in with the funnel's return path preserved.
 *
 * optionalAuth() (not bare auth()) so the keyless local/QA world redirects
 * to the sign-in page's keyless notice instead of crashing to error.tsx.
 */
export default async function HostOnboardLayout({
	children,
}: {
	children: ReactNode;
}) {
	// DEV MOCK BENCH (review tooling only): same bypass as (host)/layout so
	// the onboarding surface stays reviewable without a real session. No-op
	// in production/preview (isDevBenchEnabled() is compile-time false).
	if (isDevBenchEnabled() && (await readDevRole())) {
		return <>{children}</>;
	}

	const { userId } = await optionalAuth();
	if (!userId) {
		redirect(`/sign-in?redirect_url=${encodeURIComponent("/host/onboarding")}`);
	}

	return <>{children}</>;
}
