import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Host onboarding" };

export default function OnboardingLayout({ children }: { readonly children: ReactNode }) {
	return <>{children}</>;
}
