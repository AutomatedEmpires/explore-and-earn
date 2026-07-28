import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Host onboarding",
	description:
		"Set up your Explore & Earn host profile to publish opportunities with housing, meals, and pay, review applicants, and message seekers.",
	robots: { index: false },
};

/**
 * Never prerendered. The wizard reads `redirect_url` off the query string to
 * thread a return path through save-and-leave, and a client `useSearchParams()`
 * inside a statically rendered segment bails the whole route out at build time.
 * The segment is dynamic in practice anyway — the (host-onboard) layout above
 * calls auth() — but saying so here keeps that an intention rather than a
 * side effect of somebody else's file.
 */
export const dynamic = "force-dynamic";

export default function OnboardingLayout({ children }: { readonly children: ReactNode }) {
	return <>{children}</>;
}
