import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Host onboarding",
	description:
		"Set up your Explore & Earn host profile to publish opportunities with housing, meals, and pay, review applicants, and message seekers.",
	robots: { index: false },
};

export default function OnboardingLayout({ children }: { readonly children: ReactNode }) {
	return <>{children}</>;
}
